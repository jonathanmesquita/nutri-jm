import { test } from "node:test";
import assert from "node:assert/strict";
import { ALIMENTOS } from "../data/foods.js";
import {
  CATEGORIAS, NUTRIENTES, normalizar, pesquisar, unidadesDe, gramasDe,
  nutrientesPara, calcular, validarAlimento, montarAlimentoProprio, converterQuantidade
} from "../assets/js/foods.js";

const porId = (id) => ALIMENTOS.find((a) => a.id === id);
const perto = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("base: 597 alimentos da TACO, ids únicos, valores só número, 'Tr' ou null", () => {
  assert.equal(ALIMENTOS.length, 597);
  assert.equal(new Set(ALIMENTOS.map((a) => a.id)).size, 597);
  for (const a of ALIMENTOS) {
    assert.ok(a.categoria in CATEGORIAS, a.nome);
    assert.ok([null, "animal", "vegetable", "mixed"].includes(a.tipoProteina), a.nome);
    for (const { chave } of NUTRIENTES) {
      const v = a.por100[chave];
      assert.ok(v === null || v === "Tr" || (typeof v === "number" && v >= 0), `${a.nome}.${chave} = ${v}`);
    }
    for (const m of a.medidas) assert.ok(m.gramas > 0, `${a.nome} ${m.chave}`);
    if (a.unidadePadrao !== "g") assert.ok(a.medidas.some((m) => m.chave === a.unidadePadrao), a.nome);
  }
});

test("valores conferidos contra a TACO impressa", () => {
  // Frango, peito, sem pele, cozido (TACO 408)
  assert.deepEqual(porId("taco-408").por100, { kcal: 163, proteina: 31.5, carboidrato: 0, gordura: 3.2, fibra: null, sodio: 36 });
  // Arroz, tipo 1, cozido (TACO 3)
  assert.deepEqual(porId("taco-3").por100, { kcal: 128, proteina: 2.5, carboidrato: 28.1, gordura: 0.2, fibra: 1.6, sodio: 1 });
});

test("o que a TACO não publica fica null, nunca zero", () => {
  const leite = porId("taco-458"); // Leite, de vaca, integral
  assert.equal(leite.por100.kcal, null);
  assert.equal(leite.por100.proteina, null);
  const r = nutrientesPara(leite, 300);
  assert.equal(r.kcal, null);
  assert.equal(r.sodio, 192);
});

test("traço continua traço depois da conta", () => {
  const banana = porId("taco-182"); // Banana, prata, crua — sódio Tr
  assert.equal(banana.por100.sodio, "Tr");
  assert.equal(calcular(banana, 1, "unidade").nutrientes.sodio, "Tr");
});

test("calculadora: (por100 × quantidade) / 100", () => {
  const r = calcular(porId("taco-408"), 150, "g");
  assert.equal(r.gramas, 150);
  perto(r.nutrientes.kcal, 244.5);
  perto(r.nutrientes.proteina, 47.25);
  perto(r.nutrientes.gordura, 4.8);
  assert.equal(r.nutrientes.fibra, null);
  perto(r.nutrientes.sodio, 54);
});

test("medida caseira do IBGE: 4 ovos = 180 g", () => {
  const ovo = porId("taco-488");
  assert.equal(ovo.unidadePadrao, "unidade");
  assert.equal(gramasDe(ovo, 4, "unidade"), 180);
  perto(calcular(ovo, 4, "unidade").nutrientes.proteina, 23.94);
  assert.deepEqual(unidadesDe(ovo).map((u) => u.chave), ["g", "unidade", "metade", "porcao"]);
});

test("unidade que o alimento não tem e quantidade inválida não calculam", () => {
  const arroz = porId("taco-3");
  assert.equal(gramasDe(arroz, 1, "lata"), null);
  assert.equal(calcular(arroz, -1, "g"), null);
  assert.equal(calcular(arroz, Number.NaN, "g"), null);
});

test("pesquisa: sem acento, em qualquer ordem, com plural", () => {
  assert.equal(normalizar("Pão Francês"), "pao frances");
  assert.equal(pesquisar("peito de frango")[0].id.startsWith("taco-"), true);
  assert.ok(pesquisar("peito frango sem pele cozido").some((a) => a.id === "taco-408"));
  assert.ok(pesquisar("pao frances").some((a) => a.nome === "Pão, trigo, francês"));
  assert.ok(pesquisar("ovos")[0].nome.startsWith("Ovo"));
  assert.equal(pesquisar("arroz")[0].nome.startsWith("Arroz"), true);
  assert.deepEqual(pesquisar(""), []);
  assert.deepEqual(pesquisar("xyzw"), []);
});

test("pesquisa: começo de palavra, não pedaço do meio", () => {
  // "ovo" não pode achar "c-ovo-..." no meio de outra palavra
  for (const a of pesquisar("ovo", ALIMENTOS, 600)) {
    assert.ok(normalizar(a.nome).split(/[^a-z0-9]+/).some((p) => p.startsWith("ovo")), a.nome);
  }
});

test("tubérculo é carboidrato, mesmo sendo hortaliça na TACO", () => {
  assert.equal(porId("taco-91").categoria, "carbs"); // Batata, inglesa, cozida
  assert.equal(porId("taco-91").categoriaTaco, "Verduras, hortaliças e derivados");
});

test("alimento próprio: validação e montagem no mesmo formato", () => {
  const base = { nome: "Pasta de amendoim (rótulo)", categoria: "fat", tipoProteina: "vegetable", gramasPorUnidade: 15, nomeUnidade: "colher",
    por100: { kcal: 600, proteina: 25, carboidrato: 20, gordura: 50, fibra: null, sodio: null } };
  assert.deepEqual(validarAlimento(base), {});
  assert.ok(validarAlimento({ ...base, nome: " " }).nome);
  assert.ok(validarAlimento({ ...base, por100: { ...base.por100, kcal: null } }).kcal);
  assert.ok(validarAlimento({ ...base, por100: { ...base.por100, gordura: 120 } }).gordura);
  assert.ok(validarAlimento({ ...base, gramasPorUnidade: 0 }).gramasPorUnidade);

  const a = montarAlimentoProprio(base, "proprio-1");
  assert.equal(a.unidadePadrao, "unidade");
  assert.equal(gramasDe(a, 2, "unidade"), 30);
  perto(calcular(a, 2, "unidade").nutrientes.kcal, 180);
  assert.equal(calcular(a, 2, "unidade").nutrientes.fibra, null);
  assert.ok(pesquisar("amendoim pasta", [a]).length === 1);
});

test("trocar a unidade mantém o peso, não o número", () => {
  const arroz = porId("taco-3"); // concha = 100 g
  assert.equal(converterQuantidade(arroz, 250, "g", "concha"), 2.5);
  assert.equal(converterQuantidade(arroz, 2.5, "concha", "g"), 250);
  const ovo = porId("taco-488"); // unidade = 45 g
  assert.equal(converterQuantidade(ovo, 100, "g", "unidade"), 2.2);
  assert.equal(converterQuantidade(ovo, 10, "g", "unidade"), 0.22);
  assert.equal(converterQuantidade(ovo, 1, "g", "lata"), null);
});
