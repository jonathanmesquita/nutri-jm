import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarData, validarMedicao, ordenar, ultimaMedicao, salvarMedicao, removerMedicao,
  imcDaMedicao, variacao, estagioAvatar, desenhoAvatar, medicoesDeExemplo
} from "../assets/js/body.js";
import { ESTAGIOS_AVATAR } from "../data/default-data.js";

const HOJE = new Date(2026, 10, 20);
const med = (id, data, peso, extra = {}) => ({ id, data, peso, altura: null, gorduraPct: null, musculoPct: null, gorduraVisceral: null, tmbMedida: null, idadeCorporal: null, observacao: "", ...extra });

test("data: formato, dia que existe e nunca no futuro", () => {
  assert.ok(validarData("2026-11-20", HOJE));
  assert.ok(validarData("2024-02-29", HOJE));
  for (const d of ["2026-11-21", "2025-02-29", "2026-13-01", "20/11/2026", "", null, "1899-12-31"]) {
    assert.equal(validarData(d, HOJE), false, String(d));
  }
});

test("só data e peso são obrigatórios; o resto pode ficar em branco", () => {
  assert.deepEqual(validarMedicao(med("a", "2026-09-24", 77), HOJE), {});
  const e = validarMedicao(med("a", "2027-01-01", null, { gorduraPct: 90, altura: 50 }), HOJE);
  assert.ok(e.data && e.peso && e.gorduraPct && e.altura);
  assert.ok(validarMedicao(med("a", "2026-09-24", 77, { observacao: "x".repeat(281) }), HOJE).observacao);
});

test("histórico: mais recente primeiro; mesma data, a última cadastrada primeiro", () => {
  const lista = [med("a", "2026-09-24", 77), med("b", "2026-11-15", 78.3), med("c", "2026-11-15", 78)];
  assert.deepEqual(ordenar(lista).map((m) => m.id), ["c", "b", "a"]);
  assert.equal(ultimaMedicao(lista).id, "c");
  assert.equal(ultimaMedicao([]), null);
});

test("salvar troca a medição do mesmo id; remover tira", () => {
  let lista = salvarMedicao([], med("a", "2026-09-24", 77));
  lista = salvarMedicao(lista, med("a", "2026-09-24", 76.5));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].peso, 76.5);
  assert.deepEqual(removerMedicao(lista, "a"), []);
});

test("IMC do exemplo da especificação: 77 kg e 173 cm = 25,73", () => {
  const i = imcDaMedicao(med("a", "2026-09-24", 77, { altura: 173 }));
  assert.equal(i.valor.toFixed(2), "25.73");
  assert.equal(i.classe, "Sobrepeso");
  assert.equal(i.alturaDoPerfil, false);
});

test("IMC usa a altura do perfil quando a medição não tem; sem nenhuma, não inventa", () => {
  assert.equal(imcDaMedicao(med("a", "2026-11-15", 78.3), 173).alturaDoPerfil, true);
  assert.equal(imcDaMedicao(med("a", "2026-11-15", 78.3), null), null);
});

test("variação para a medição anterior, só onde os dois lados têm valor", () => {
  const lista = [med("a", "2026-09-24", 77, { gorduraPct: 19 }), med("b", "2026-11-15", 78.3)];
  const v = variacao(lista, "b");
  assert.equal(v.anteriorEm, "2026-09-24");
  assert.equal(Number(v.dif.peso.toFixed(1)), 1.3);
  assert.equal(v.dif.gorduraPct, null);
  assert.equal(variacao(lista, "a"), null, "a mais antiga não tem anterior");
});

test("avatar: 8 estágios cobrindo todo IMC, sem buraco", () => {
  assert.equal(ESTAGIOS_AVATAR.length, 8);
  for (let i = 1; i < ESTAGIOS_AVATAR.length; i++) assert.equal(ESTAGIOS_AVATAR[i].min, ESTAGIOS_AVATAR[i - 1].max);
  assert.equal(estagioAvatar(10).numero, 1);
  assert.equal(estagioAvatar(18.5).numero, 3);
  assert.equal(estagioAvatar(25.73).numero, 5);
  assert.equal(estagioAvatar(60).numero, 8);
  assert.equal(estagioAvatar(Number.NaN), null);
});

test("desenho do avatar cabe na grade de 24 × 32 em todos os estágios e alarga com eles", () => {
  let anterior = 0;
  for (const e of ESTAGIOS_AVATAR) {
    const px = desenhoAvatar(e);
    for (const p of px) {
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 24 && p.y + p.h <= 32, JSON.stringify(p));
    }
    const largura = Math.max(...px.map((p) => p.x + p.w)) - Math.min(...px.map((p) => p.x));
    assert.ok(largura >= anterior, `estágio ${e.largura}`);
    anterior = largura;
  }
});

test("medições de exemplo são válidas e ficam no passado", () => {
  const lista = medicoesDeExemplo(HOJE);
  for (const m of lista) assert.deepEqual(validarMedicao(m, HOJE), {}, m.id);
  assert.equal(ultimaMedicao(lista).id, "exemplo-3");
});
