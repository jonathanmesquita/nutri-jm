import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CHAVES, nomeArquivo, exportar, lerBackup, importar, apagarTudo, resumo } from "../assets/js/backup.js";
import { PERFIL_DEMONSTRACAO } from "../data/default-data.js";
import { diaDeExemplo } from "../assets/js/diet.js";
import { medicoesDeExemplo } from "../assets/js/body.js";

const HOJE = new Date(2026, 10, 20, 12, 0);

/* storage em memória, com a mesma interface do de verdade */
function memoria(inicial = {}) {
  const m = new Map(Object.entries(inicial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get: (k, padrao = null) => (m.has(k) ? JSON.parse(m.get(k)) : padrao),
    set: (k, v) => (m.set(k, JSON.stringify(v)), true),
    remove: (k) => m.delete(k),
    chaves: () => [...m.keys()].sort()
  };
}

const cheio = () =>
  memoria({
    perfil: PERFIL_DEMONSTRACAO,
    dieta: diaDeExemplo(),
    medicoes: medicoesDeExemplo(HOJE),
    preferencias: { avatar: false },
    compras: { versao: 1, diasGerados: 7, itens: [{ id: "m1", nome: "Creatina", grupo: "suplementos", status: "comprar", origem: "manual" }] },
    alimentos: [{ id: "proprio-1", nome: "Pasta de amendoim", categoria: "fat", tipoProteina: "vegetable", unidadePadrao: "g", medidas: [], por100: { kcal: 600, proteina: 25, carboidrato: 20, gordura: 50, fibra: null, sodio: null }, proprio: true }],
    medicacao: { versao: 1, config: { intervaloDias: 7, avisoDoses: 1 }, canetas: [{ id: "c1", nome: "Caneta", apresentacao: "dose-unica", volumeTotalMl: 2, doseMg: 5, volumePorDoseMl: 0.5, ativa: true }], aplicacoes: [], sintomas: [] }
  });

test("nome do arquivo com a data, como na especificação", () => {
  assert.equal(nomeArquivo(HOJE), "nutri-jm-backup-2026-11-20.json");
});

test("toda chave que o código grava está no backup", () => {
  const pasta = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../assets/js");
  const usadas = new Set();
  for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith(".js"))) {
    const fonte = fs.readFileSync(path.join(pasta, arq), "utf8");
    for (const [, k] of fonte.matchAll(/storage\.(?:set|get)\("([a-z]+)"/g)) usadas.add(k);
    for (const [, k] of fonte.matchAll(/const CHAVE[A-Z_]* = "([a-z]+)"/g)) usadas.add(k);
  }
  assert.ok(usadas.size >= 7, [...usadas].join(", "));
  for (const k of usadas) assert.ok(CHAVES.includes(k), `chave "${k}" fora do backup`);
});

test("ida e volta: exportar → ler → importar deixa tudo igual", () => {
  const origem = cheio();
  const arquivo = JSON.stringify(exportar(origem, HOJE));
  const lido = lerBackup(arquivo, HOJE);
  assert.equal(lido.ok, true, lido.erro);
  assert.deepEqual(lido.resumo, { perfil: 1, refeicoes: 4, alimentosProprios: 1, medicoes: 3, itensDeCompra: 1, canetas: 1, aplicacoes: 0 });
  const destino = memoria({ perfil: { nome: "outro" }, lixo: 1 });
  assert.equal(importar(destino, lido.dados), true);
  for (const k of CHAVES) assert.deepEqual(destino.get(k), JSON.parse(JSON.stringify(origem.get(k))), k);
  assert.equal(destino.get("lixo"), 1, "chave que não é do app não é tocada");
});

test("importar substitui: o que não está no backup é apagado", () => {
  const destino = cheio();
  const lido = lerBackup(JSON.stringify({ app: "nutri-jm", versao: 1, dados: { perfil: PERFIL_DEMONSTRACAO } }), HOJE);
  importar(destino, lido.dados);
  assert.deepEqual(destino.chaves(), ["perfil"]);
});

test("arquivo errado é recusado com o motivo, sem gravar nada", () => {
  const casos = [
    ["", /vazio/],
    ["{não é json", /JSON válido/],
    [JSON.stringify({ app: "outro", versao: 1, dados: {} }), /não é um backup/],
    [JSON.stringify({ app: "nutri-jm", versao: 2, dados: {} }), /Versão de backup 2/],
    [JSON.stringify({ app: "nutri-jm", versao: 1, dados: { perfil: { ...PERFIL_DEMONSTRACAO, peso: 5 } } }), /perfil.*peso/],
    [JSON.stringify({ app: "nutri-jm", versao: 1, dados: { medicoes: [{ id: "a", data: "2099-01-01", peso: 70 }] } }), /Medição inválida/],
    [JSON.stringify({ app: "nutri-jm", versao: 1, dados: { dieta: { refeicoes: "x" } } }), /dieta/],
    [JSON.stringify({ app: "nutri-jm", versao: 1, dados: { alimentos: [{ id: "x", nome: "", categoria: "fat", por100: {} }] } }), /Alimento/],
    ["x".repeat(5 * 1024 * 1024 + 1), /grande demais/]
  ];
  for (const [texto, motivo] of casos) {
    const r = lerBackup(texto, HOJE);
    assert.equal(r.ok, false, texto.slice(0, 40));
    assert.match(r.erro, motivo);
  }
});

test("apagar tudo remove só as chaves do app", () => {
  const s = cheio();
  s.set("outra-coisa", 1);
  apagarTudo(s);
  assert.deepEqual(s.chaves(), ["outra-coisa"]);
});

test("resumo de backup vazio", () => {
  assert.deepEqual(Object.values(resumo({})), [0, 0, 0, 0, 0, 0, 0]);
});
