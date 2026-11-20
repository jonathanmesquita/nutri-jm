import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tmbHarrisBenedict, tmbEmUso, gcd, ajusteDoObjetivo, metaCalorica,
  metasDeMacros, imc, classificarImc, porKg, resumo, validarPerfil
} from "../assets/js/calculations.js";
import { PERFIL_DEMONSTRACAO } from "../data/default-data.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("Harris-Benedict da especificação", () => {
  // 66,47 + 13,75×77,1 + 5×173 − 6,8×32
  perto(tmbHarrisBenedict({ peso: 77.1, altura: 173, idade: 32 }), 1773.995);
});

test("TMB medida tem prioridade quando escolhida", () => {
  const base = { peso: 77.1, altura: 173, idade: 32, tmbMedida: 1742 };
  assert.equal(tmbEmUso({ ...base, fonteTmb: "medida" }).valor, 1742);
  assert.equal(tmbEmUso({ ...base, fonteTmb: "medida" }).fonte, "medida");
  assert.equal(tmbEmUso({ ...base, fonteTmb: "calculada" }).fonte, "calculada");
  assert.equal(tmbEmUso({ ...base, tmbMedida: null, fonteTmb: "medida" }).fonte, "calculada");
});

test("GCD e meta do exemplo da especificação", () => {
  const g = gcd(1742, 1.5);
  assert.equal(g, 2613);
  assert.equal(metaCalorica(g, 300), 2913);
});

test("ajuste por objetivo", () => {
  assert.equal(ajusteDoObjetivo({ objetivo: "manutencao" }), 0);
  assert.equal(ajusteDoObjetivo({ objetivo: "cutting" }), -500);
  assert.equal(ajusteDoObjetivo({ objetivo: "bulking" }), 300);
  assert.equal(ajusteDoObjetivo({ objetivo: "personalizado", ajustePersonalizado: -250 }), -250);
});

test("macros: proteína e gordura por kg, carboidrato pelo que sobra", () => {
  const m = metasDeMacros({ peso: 77, metaKcal: 2913, proteinaPorKg: 2, gorduraPorKg: 1 });
  assert.equal(m.proteina, 154);
  assert.equal(m.gordura, 77);
  // (2913 − 616 − 693) ÷ 4 = 401
  perto(m.carboidrato, 401);
  assert.equal(m.excesso, 0);
});

test("macros: carboidrato nunca negativo, excesso informado", () => {
  const m = metasDeMacros({ peso: 100, metaKcal: 1200, proteinaPorKg: 2.5, gorduraPorKg: 1.5 });
  assert.equal(m.carboidrato, 0);
  assert.ok(m.excesso > 0);
});

test("IMC e classificação", () => {
  perto(imc(77.1, 173), 25.76, 0.01);
  assert.equal(classificarImc(18.4), "Abaixo do peso");
  assert.equal(classificarImc(22), "Peso normal");
  assert.equal(classificarImc(25.76), "Sobrepeso");
  assert.equal(classificarImc(41), "Obesidade grau III");
});

test("g/kg", () => {
  assert.equal(porKg(154, 77), 2);
});

test("resumo do perfil de demonstração não tem buracos", () => {
  const r = resumo(PERFIL_DEMONSTRACAO);
  for (const v of [r.tmb.valor, r.gcd, r.meta, r.macros.proteina, r.macros.carboidrato, r.imc.valor]) {
    assert.ok(Number.isFinite(v));
  }
  assert.deepEqual(validarPerfil(PERFIL_DEMONSTRACAO), {});
});

test("validação aponta campo fora da faixa", () => {
  const erros = validarPerfil({ ...PERFIL_DEMONSTRACAO, peso: 5, altura: null, nome: "" });
  assert.ok(erros.peso);
  assert.ok(erros.altura);
  assert.ok(erros.nome);
});
