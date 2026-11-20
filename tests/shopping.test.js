import { test } from "node:test";
import assert from "node:assert/strict";
import { ALIMENTOS } from "../data/foods.js";
import { diaDeExemplo, dietaPadrao, adicionarItem } from "../assets/js/diet.js";
import {
  GRUPOS, listaVazia, normalizarLista, adicionarManual, mudarStatus, removerItem, limparConcluidos,
  gerarDaDieta, agrupar, textoQuantidade, textoParaCopiar, grupoDoAlimento
} from "../assets/js/shopping.js";

const buscar = (id) => ALIMENTOS.find((a) => a.id === id) ?? null;

test("manual: adiciona, não repete (sem diferenciar maiúscula) e exige nome", () => {
  let l = adicionarManual(listaVazia(), { id: "m1", nome: " Creatina ", grupo: "suplementos" });
  assert.deepEqual(l.itens[0], { id: "m1", nome: "Creatina", grupo: "suplementos", status: "comprar", origem: "manual" });
  assert.throws(() => adicionarManual(l, { id: "m2", nome: "creatina", grupo: "outros" }), /já está/);
  assert.throws(() => adicionarManual(l, { id: "m3", nome: "  ", grupo: "outros" }));
  l = adicionarManual(l, { id: "m4", nome: "Mel", grupo: "inexistente" });
  assert.equal(l.itens[1].grupo, "outros");
});

test("status: comprar, já tenho, comprado, ignorar", () => {
  let l = adicionarManual(listaVazia(), { id: "m1", nome: "Mel", grupo: "despensa" });
  l = mudarStatus(l, "m1", "comprado");
  assert.equal(l.itens[0].status, "comprado");
  assert.equal(mudarStatus(l, "m1", "xyz").itens[0].status, "comprado");
  assert.equal(removerItem(l, "m1").itens.length, 0);
});

test("limpar concluídos tira comprados e ignorados, mantém o resto", () => {
  let l = listaVazia();
  for (const [id, s] of [["a", "comprar"], ["b", "tenho"], ["c", "comprado"], ["d", "ignorar"]]) {
    l = mudarStatus(adicionarManual(l, { id, nome: id, grupo: "outros" }), id, s);
  }
  assert.deepEqual(limparConcluidos(l).itens.map((i) => i.id), ["a", "b"]);
});

test("gerar da dieta soma o peso por alimento e multiplica pelos dias", () => {
  let d = dietaPadrao();
  d = adicionarItem(d, "ref-4", { alimentoId: "taco-410", quantidade: 120, unidade: "g" }); // almoço: frango
  d = adicionarItem(d, "ref-6", { alimentoId: "taco-410", quantidade: 1, unidade: "file" }); // jantar: 1 filé = 100 g
  d = adicionarItem(d, "ref-2", { alimentoId: "taco-488", quantidade: 2, unidade: "unidade" }); // 2 ovos = 90 g
  const l = gerarDaDieta(listaVazia(), d, buscar, 7);
  const frango = l.itens.find((i) => i.alimentoId === "taco-410");
  assert.equal(frango.gramas, 220 * 7);
  assert.equal(frango.grupo, "proteinas");
  assert.equal(l.itens.find((i) => i.alimentoId === "taco-488").gramas, 90 * 7);
  assert.equal(l.itens.length, 2);
});

test("gerar de novo mantém os manuais e o status de quem já estava", () => {
  let l = adicionarManual(listaVazia(), { id: "m1", nome: "Creatina", grupo: "suplementos" });
  l = gerarDaDieta(l, diaDeExemplo(), buscar, 7);
  const arroz = l.itens.find((i) => i.alimentoId === "taco-3");
  l = mudarStatus(l, arroz.id, "tenho");
  l = gerarDaDieta(l, diaDeExemplo(), buscar, 3);
  assert.equal(l.itens.find((i) => i.alimentoId === "taco-3").status, "tenho");
  assert.equal(l.itens.find((i) => i.alimentoId === "taco-3").gramas, 150 * 3);
  assert.ok(l.itens.some((i) => i.id === "m1"));
  assert.equal(l.diasGerados, 3);
  // alimento que saiu da dieta sai da lista
  l = gerarDaDieta(l, dietaPadrao(), buscar, 7);
  assert.deepEqual(l.itens.map((i) => i.id), ["m1"]);
});

test("dia de exemplo vira lista em grupos, na ordem da especificação", () => {
  const l = gerarDaDieta(listaVazia(), diaDeExemplo(), buscar, 7);
  const grupos = agrupar(l.itens).map(([g]) => g);
  const ordem = Object.keys(GRUPOS);
  assert.deepEqual(grupos, [...grupos].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)));
  assert.ok(grupos.includes("proteinas") && grupos.includes("carboidratos") && grupos.includes("frutas") && grupos.includes("verduras"));
  assert.equal(grupoDoAlimento(buscar("taco-91")), "carboidratos"); // batata
});

test("quantidade aproximada e texto para copiar só com o que falta comprar", () => {
  assert.equal(textoQuantidade(1540), "≈ 1,54 kg");
  assert.equal(textoQuantidade(634), "≈ 630 g");
  assert.equal(textoQuantidade(0), "");
  let l = adicionarManual(listaVazia(), { id: "a", nome: "Mel", grupo: "despensa" });
  l = adicionarManual(l, { id: "b", nome: "Creatina", grupo: "suplementos" });
  l = mudarStatus(l, "b", "tenho");
  assert.equal(textoParaCopiar(l), "DESPENSA\n□ Mel");
  assert.equal(textoParaCopiar(listaVazia()), "");
});

test("normalizar descarta lixo", () => {
  const l = normalizarLista({ itens: [{ id: "a", nome: "X", grupo: "zz", status: "zz" }, { id: 1 }, null], diasGerados: 99 });
  assert.equal(l.itens.length, 1);
  assert.equal(l.itens[0].grupo, "outros");
  assert.equal(l.itens[0].status, "comprar");
  assert.equal(l.diasGerados, 7);
});
