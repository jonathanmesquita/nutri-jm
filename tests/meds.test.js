import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoVazio, normalizar, paraData, paraTexto, validarCaneta, salvarCaneta, ativarCaneta, removerCaneta,
  canetaAtiva, saldo, validarAplicacao, registrarAplicacao, removerAplicacao, proximaAplicacao, textoTempo,
  usoPorLocal, proximoLocal, alertas, registrarSintomas, evolucao, LOCAIS
} from "../assets/js/meds.js";

const AGORA = new Date(2026, 10, 20, 10, 0); // 20/11/2026 10:00, horário local
const caixa = (extra = {}) => ({
  id: "c1", nome: "Caneta de teste", apresentacao: "dose-unica", volumeTotalMl: 2.0, doseMg: 5,
  volumePorDoseMl: 0.5, abertaEm: null, diasForaGeladeira: null, validade: null, lote: "", ativa: true, ...extra
});
const comCaixa = (extra) => salvarCaneta(estadoVazio(), caixa(extra));
let n = 0;
const aplicar = (e, dataHora, local = "abdomen-direito", canetaId = "c1") =>
  registrarAplicacao(e, { id: `a${++n}`, canetaId, dataHora, local }, AGORA);

test("datas no horário local: dia que existe, com ou sem hora", () => {
  assert.equal(paraData("2026-11-15T08:30").getHours(), 8);
  assert.equal(paraData("2026-02-30"), null);
  assert.equal(paraData("2026-11-15T24:00"), null);
  assert.equal(paraTexto(new Date(2026, 0, 5, 7, 3)), "2026-01-05T07:03");
});

test("caneta: validação dos números da caixa", () => {
  assert.deepEqual(validarCaneta(caixa()), {});
  const e = validarCaneta(caixa({ nome: " ", volumeTotalMl: 0, doseMg: -1, apresentacao: "x", diasForaGeladeira: 2.5 }));
  assert.ok(e.nome && e.volumeTotalMl && e.doseMg && e.apresentacao && e.diasForaGeladeira);
  assert.ok(validarCaneta(caixa({ volumePorDoseMl: 3 })).volumePorDoseMl, "dose maior que o total");
});

test("saldo do exemplo da especificação: caixa de 2,0 mL, 0,5 mL por dose", () => {
  let e = comCaixa();
  assert.deepEqual(saldo(caixa(), e.aplicacoes), { usadoMl: 0, restanteMl: 2, doses: 4, aplicacoes: 0 });
  e = aplicar(e, "2026-11-01T08:00");
  e = aplicar(e, "2026-11-08T08:00");
  const s = saldo(canetaAtiva(e), e.aplicacoes);
  assert.equal(s.restanteMl, 1);
  assert.equal(s.doses, 2);
});

test("doses restantes arredondam para baixo e aguentam erro de ponto flutuante", () => {
  const c = caixa({ volumeTotalMl: 0.3, volumePorDoseMl: 0.1 });
  assert.equal(saldo(c, []).doses, 3); // 0,3 ÷ 0,1 em ponto flutuante dá 2,999…
  assert.equal(saldo(caixa({ volumeTotalMl: 1.2 }), []).doses, 2);
});

test("aplicação desconta a dose e o volume cadastrados na caneta", () => {
  const e = aplicar(comCaixa(), "2026-11-15T08:30");
  assert.deepEqual(e.aplicacoes[0], { id: e.aplicacoes[0].id, canetaId: "c1", dataHora: "2026-11-15T08:30", local: "abdomen-direito", doseMg: 5, volumeMl: 0.5 });
});

test("sem dose no estoque, futuro, local ou hora faltando: não registra", () => {
  let e = comCaixa({ volumeTotalMl: 0.5 });
  e = aplicar(e, "2026-11-01T08:00");
  assert.throws(() => aplicar(e, "2026-11-08T08:00"), /não tem mais dose/);
  const e2 = comCaixa();
  assert.ok(validarAplicacao(e2, { canetaId: "c1", dataHora: "2026-11-21T08:00", local: "coxa-direita" }, AGORA).dataHora);
  assert.ok(validarAplicacao(e2, { canetaId: "c1", dataHora: "2026-11-15", local: "coxa-direita" }, AGORA).dataHora);
  assert.ok(validarAplicacao(e2, { canetaId: "c1", dataHora: "2026-11-15T08:00", local: "nariz" }, AGORA).local);
});

test("aplicação sem caneta não mexe no estoque", () => {
  const e = registrarAplicacao(comCaixa(), { id: "x", canetaId: null, dataHora: "2026-11-15T08:00", local: "coxa-esquerda", doseMg: 2.5 }, AGORA);
  assert.equal(e.aplicacoes[0].volumeMl, 0);
  assert.equal(e.aplicacoes[0].doseMg, 2.5);
  assert.equal(saldo(canetaAtiva(e), e.aplicacoes).doses, 4);
});

test("remover aplicação devolve a dose ao saldo; remover caneta mantém o histórico", () => {
  let e = aplicar(comCaixa(), "2026-11-15T08:00");
  e = removerAplicacao(e, e.aplicacoes[0].id);
  assert.equal(saldo(canetaAtiva(e), e.aplicacoes).doses, 4);
  e = aplicar(e, "2026-11-15T08:00");
  e = removerCaneta(e, "c1");
  assert.equal(e.aplicacoes.length, 1);
  assert.equal(canetaAtiva(e), null);
});

test("uma caneta ativa por vez", () => {
  let e = comCaixa();
  e = salvarCaneta(e, caixa({ id: "c2", ativa: false }));
  assert.equal(canetaAtiva(e).id, "c1");
  e = ativarCaneta(e, "c2");
  assert.equal(canetaAtiva(e).id, "c2");
  assert.equal(e.canetas.filter((c) => c.ativa).length, 1);
  e = salvarCaneta(estadoVazio(), caixa({ ativa: false }));
  assert.equal(canetaAtiva(e).id, "c1", "a primeira caneta vira a ativa");
});

test("próxima aplicação só com intervalo configurado pela pessoa", () => {
  let e = aplicar(comCaixa(), "2026-11-15T08:00");
  assert.equal(proximaAplicacao(e, AGORA).estado, "sem-intervalo");
  e = { ...e, config: { ...e.config, intervaloDias: 7 } };
  const p = proximaAplicacao(e, AGORA);
  assert.equal(p.estado, "agendada");
  assert.equal(paraTexto(p.quando), "2026-11-22T08:00");
  assert.equal(textoTempo(p.ms), "em 1 dia e 22 h");
  assert.equal(proximaAplicacao(e, new Date(2026, 10, 23, 9, 0)).estado, "atrasada");
  assert.equal(proximaAplicacao(comCaixa(), AGORA).estado, "sem-aplicacao");
});

test("texto do tempo", () => {
  assert.equal(textoTempo(3 * 86400000), "em 3 dias");
  assert.equal(textoTempo(2 * 3600000 + 5 * 60000), "em 2 h e 5 min");
  assert.equal(textoTempo(-(86400000 + 3600000)), "há 1 dia e 1 h");
  assert.equal(textoTempo(30000), "em 1 minuto");
});

test("rodízio: nunca usado primeiro, depois o usado há mais tempo", () => {
  assert.equal(proximoLocal([]), "braco-esquerdo");
  let e = comCaixa({ volumeTotalMl: 10 });
  for (const [i, local] of Object.keys(LOCAIS).entries()) e = aplicar(e, `2026-11-0${i + 1}T08:00`, local);
  assert.equal(proximoLocal(e.aplicacoes), "braco-esquerdo");
  e = aplicar(e, "2026-11-08T08:00", "braco-esquerdo");
  assert.equal(proximoLocal(e.aplicacoes), "braco-direito");
  assert.equal(usoPorLocal(e.aplicacoes)["braco-esquerdo"], "2026-11-08T08:00");
});

test("alertas: última dose, previsão de compra, prazo fora da geladeira e validade", () => {
  let e = comCaixa({ abertaEm: "2026-11-01", diasForaGeladeira: 21, validade: "2026-12-10" });
  e = { ...e, config: { intervaloDias: 7, avisoDoses: 1 } };
  e = aplicar(e, "2026-11-01T08:00");
  e = aplicar(e, "2026-11-08T08:00");
  e = aplicar(e, "2026-11-15T08:00");
  const textos = alertas(e, AGORA).map((a) => `${a.nivel}: ${a.texto}`);
  assert.ok(textos.some((t) => t.startsWith("aviso") && t.includes("resta 1 aplicação")), textos.join("\n"));
  assert.ok(textos.some((t) => t.includes("até 22/11/2026")), textos.join("\n"));
  assert.ok(textos.some((t) => t.includes("fora da geladeira") && t.includes("2 dia(s)")), textos.join("\n"));
  assert.ok(textos.some((t) => t.includes("validade") && t.includes("20 dia(s)")), textos.join("\n"));
  assert.deepEqual(alertas(estadoVazio(), AGORA), []);
});

test("sintomas: ao menos um, e 'Nenhum' sozinho", () => {
  const e = registrarSintomas(estadoVazio(), { id: "s1", data: "2026-11-16", itens: ["nausea", "azia", "nausea", "xyz"] });
  assert.deepEqual(e.sintomas[0].itens, ["nausea", "azia"]);
  assert.throws(() => registrarSintomas(estadoVazio(), { id: "s", data: "2026-11-16", itens: [] }));
  assert.throws(() => registrarSintomas(estadoVazio(), { id: "s", data: "2026-11-16", itens: ["nenhum", "fadiga"] }));
  assert.throws(() => registrarSintomas(estadoVazio(), { id: "s", data: "xx", itens: ["fadiga"] }));
});

test("evolução: cada aplicação com o peso da última medição até aquela data", () => {
  let e = comCaixa();
  e = aplicar(e, "2026-11-01T08:00");
  e = aplicar(e, "2026-11-15T08:00");
  const medicoes = [{ data: "2026-11-10", peso: 78 }, { data: "2026-11-20", peso: 77 }];
  assert.deepEqual(evolucao(e.aplicacoes, medicoes).map((l) => [l.dataHora, l.doseMg, l.peso]), [
    ["2026-11-01T08:00", 5, null],
    ["2026-11-15T08:00", 5, 78]
  ]);
});

test("normalizar descarta lixo do armazenamento", () => {
  const e = normalizar({ config: { intervaloDias: -3 }, canetas: [{ id: "x", volumeTotalMl: 0 }], aplicacoes: [{ id: "a", dataHora: "lixo" }] });
  assert.equal(e.config.intervaloDias, null);
  assert.equal(e.canetas.length, 0);
  assert.equal(e.aplicacoes.length, 0);
  assert.deepEqual(normalizar(null), estadoVazio());
});
