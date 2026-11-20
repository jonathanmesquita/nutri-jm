import { test } from "node:test";
import assert from "node:assert/strict";
import { ALIMENTOS } from "../data/foods.js";
import { REFEICOES_PADRAO } from "../data/default-data.js";
import {
  dietaPadrao, normalizarDieta, validarHorario, adicionarRefeicao, removerRefeicao, editarRefeicao,
  moverRefeicao, adicionarItem, editarItem, removerItem, totaisItem, totaisRefeicao, totaisDia,
  estadoProgresso, resumoDiario, diaDeExemplo
} from "../assets/js/diet.js";

const buscar = (id) => ALIMENTOS.find((a) => a.id === id) ?? null;
const perto = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("dieta padrão tem as 8 refeições da especificação, vazias", () => {
  const d = dietaPadrao();
  assert.deepEqual(d.refeicoes.map((r) => r.nome), REFEICOES_PADRAO);
  assert.ok(d.refeicoes.every((r) => r.itens.length === 0));
});

test("operações não alteram a dieta recebida", () => {
  const d = dietaPadrao();
  const copia = JSON.stringify(d);
  adicionarRefeicao(d, "Ceia 2");
  removerRefeicao(d, "ref-1");
  moverRefeicao(d, "ref-2", -1);
  adicionarItem(d, "ref-1", { alimentoId: "taco-3", quantidade: 100, unidade: "g" });
  assert.equal(JSON.stringify(d), copia);
});

test("criar, renomear, mudar horário, mover e remover refeição", () => {
  let d = adicionarRefeicao(dietaPadrao(), "  Lanche extra  ", "21:00");
  const nova = d.refeicoes.at(-1);
  assert.equal(nova.nome, "Lanche extra");
  assert.equal(nova.horario, "21:00");
  d = editarRefeicao(d, nova.id, { nome: "Ceia tardia", horario: "22:15" });
  assert.equal(d.refeicoes.at(-1).nome, "Ceia tardia");
  d = moverRefeicao(d, nova.id, -1);
  assert.equal(d.refeicoes.at(-2).id, nova.id);
  assert.equal(moverRefeicao(d, d.refeicoes[0].id, -1), d, "primeira não sobe");
  d = removerRefeicao(d, nova.id);
  assert.equal(d.refeicoes.length, 8);
  assert.throws(() => adicionarRefeicao(d, "  "));
  assert.throws(() => editarRefeicao(d, "ref-1", { nome: "Café", horario: "25:00" }));
});

test("horário HH:MM", () => {
  assert.ok(validarHorario("07:05"));
  assert.ok(validarHorario("23:59"));
  for (const h of ["7:05", "24:00", "12:60", "", null, "ab:cd"]) assert.equal(validarHorario(h), false, String(h));
});

test("adicionar, editar quantidade e remover alimento", () => {
  let d = adicionarItem(dietaPadrao(), "ref-4", { alimentoId: "taco-410", quantidade: 150, unidade: "g" });
  const item = d.refeicoes[3].itens[0];
  d = editarItem(d, "ref-4", item.id, { quantidade: 200 });
  assert.equal(d.refeicoes[3].itens[0].quantidade, 200);
  assert.throws(() => editarItem(d, "ref-4", item.id, { quantidade: 0 }));
  assert.throws(() => adicionarItem(d, "ref-4", { alimentoId: "taco-3", quantidade: -1, unidade: "g" }));
  d = removerItem(d, "ref-4", item.id);
  assert.equal(d.refeicoes[3].itens.length, 0);
});

test("subtotal da refeição separa proteína animal e vegetal", () => {
  let d = dietaPadrao();
  d = adicionarItem(d, "ref-4", { alimentoId: "taco-410", quantidade: 150, unidade: "g" }); // frango grelhado: 32 g/100 g
  d = adicionarItem(d, "ref-4", { alimentoId: "taco-3", quantidade: 250, unidade: "g" }); // arroz cozido: 2,5 g/100 g
  const t = totaisRefeicao(d.refeicoes[3], buscar);
  const frango = buscar("taco-410").por100, arroz = buscar("taco-3").por100;
  perto(t.proteinaAnimal, frango.proteina * 1.5);
  perto(t.proteinaVegetal, arroz.proteina * 2.5);
  perto(t.proteina, t.proteinaAnimal + t.proteinaVegetal);
  perto(t.kcal, frango.kcal * 1.5 + arroz.kcal * 2.5);
  perto(t.carboidrato, frango.carboidrato * 1.5 + arroz.carboidrato * 2.5);
  assert.deepEqual(t.incompleto, {});
});

test("alimento sem dado deixa o total marcado como incompleto, sem virar zero escondido", () => {
  let d = adicionarItem(dietaPadrao(), "ref-2", { alimentoId: "taco-458", quantidade: 300, unidade: "g" }); // leite integral: sem kcal
  d = adicionarItem(d, "ref-2", { alimentoId: "taco-53", quantidade: 1, unidade: "unidade" });
  const t = totaisDia(d, buscar);
  perto(t.kcal, 150); // só o pão: 300 kcal/100 g × 50 g
  assert.deepEqual(t.incompleto.kcal, ["Leite, de vaca, integral"]);
  assert.deepEqual(t.incompleto.proteina, ["Leite, de vaca, integral"]);
});

test("alimento apagado não quebra a conta", () => {
  const d = adicionarItem(dietaPadrao(), "ref-1", { alimentoId: "proprio-sumiu", quantidade: 1, unidade: "g" });
  const t = totaisDia(d, buscar);
  assert.equal(t.kcal, 0);
  assert.deepEqual(t.incompleto.alimento, ["alimento removido"]);
});

test("proteína sem tipo (preparação, café) não é dividida por palpite", () => {
  const t = totaisItem({ alimentoId: "taco-471", quantidade: 200, unidade: "g" }, buscar); // café: tipo null
  perto(t.proteinaSemTipo, t.proteina);
  assert.equal(t.proteinaAnimal + t.proteinaVegetal, 0);
});

test("estado do progresso: abaixo, próximo, atingido, acima", () => {
  assert.equal(estadoProgresso(50, 100), "abaixo");
  assert.equal(estadoProgresso(90, 100), "proximo");
  assert.equal(estadoProgresso(100, 100), "atingido");
  assert.equal(estadoProgresso(103, 100), "atingido");
  assert.equal(estadoProgresso(110, 100), "acima");
  assert.equal(estadoProgresso(10, 0), null);
});

test("resumo diário: o exemplo da especificação", () => {
  const totais = { kcal: 2200, proteina: 132, carboidrato: 280, gordura: 65, incompleto: {} };
  const metas = { kcal: 2913, proteina: 154, carboidrato: 390, gordura: 77 };
  const [kcal, prot, carb, gord] = resumoDiario(totais, metas, 77);
  assert.equal(kcal.diferenca, -713);
  assert.equal(Math.round(kcal.percentual), 76);
  perto(kcal.consumidoPorKg, 28.57, 0.01);
  perto(kcal.metaPorKg, 37.83, 0.01);
  assert.equal(prot.diferenca, -22);
  assert.equal(Math.round(prot.percentual), 86);
  perto(prot.consumidoPorKg, 1.714, 0.001);
  assert.equal(prot.metaPorKg, 2);
  assert.equal(Math.round(carb.percentual), 72);
  assert.equal(Math.round(gord.percentual), 84);
  assert.equal(prot.estado, "proximo");
  assert.equal(kcal.estado, "abaixo");
});

test("dia de exemplo usa só alimentos e medidas que existem", () => {
  const d = diaDeExemplo();
  assert.equal(d.refeicoes.length, 4);
  const t = totaisDia(d, buscar);
  assert.ok(t.kcal > 1000 && t.kcal < 3000, String(t.kcal));
  assert.deepEqual(t.incompleto, {});
  assert.ok(t.proteinaAnimal > 0 && t.proteinaVegetal > 0);
});

test("normalizar dieta do armazenamento descarta lixo", () => {
  assert.equal(normalizarDieta(null).refeicoes.length, 8);
  const d = normalizarDieta({ refeicoes: [{ id: "a", nome: "X", horario: "99:99", itens: [{ id: 1, alimentoId: "taco-3", quantidade: -5 }, { id: 2, alimentoId: "taco-3", quantidade: 10 }] }, null] });
  assert.equal(d.refeicoes.length, 1);
  assert.equal(d.refeicoes[0].horario, "");
  assert.equal(d.refeicoes[0].itens.length, 1);
  assert.equal(d.refeicoes[0].itens[0].unidade, "g");
});
