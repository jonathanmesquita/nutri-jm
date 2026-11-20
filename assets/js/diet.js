/*
 * Dieta: refeições, itens, subtotais e resumo do dia. Sem DOM, para ter teste.
 *
 * Toda operação devolve uma dieta NOVA (não altera a recebida): a tela salva o
 * resultado e redesenha. Formato salvo em storage("dieta"):
 *
 *   { versao: 1, refeicoes: [{ id, nome, horario: "HH:MM" | "", itens: [
 *       { id, alimentoId, quantidade, unidade } ] }] }
 *
 * Nas somas, "traço" conta como zero (é menos do que a análise mede) e valor que a
 * fonte não publica (null) fica de fora — e o total é marcado como incompleto, com o
 * nome dos alimentos que faltaram, em vez de fingir que é exato.
 */

import { REFEICOES_PADRAO, PROGRESSO } from "../../data/default-data.js";
import { calcular } from "./foods.js";

export const MACROS = ["kcal", "proteina", "carboidrato", "gordura"];

let contador = 0;
export function novoId(prefixo) {
  contador += 1;
  return `${prefixo}-${Date.now().toString(36)}${contador.toString(36)}`;
}

/* ---------- estrutura ---------- */

export function dietaPadrao() {
  return {
    versao: 1,
    refeicoes: REFEICOES_PADRAO.map((nome, i) => ({ id: `ref-${i + 1}`, nome, horario: "", itens: [] }))
  };
}

/* Aceita o que veio do armazenamento e devolve uma dieta válida (ou a padrão). */
export function normalizarDieta(bruta) {
  if (!bruta || !Array.isArray(bruta.refeicoes)) return dietaPadrao();
  return {
    versao: 1,
    refeicoes: bruta.refeicoes
      .filter((r) => r && typeof r.id === "string")
      .map((r) => ({
        id: r.id,
        nome: String(r.nome ?? "Refeição").slice(0, 60),
        horario: validarHorario(r.horario) ? r.horario : "",
        itens: (Array.isArray(r.itens) ? r.itens : [])
          .filter((i) => i && typeof i.alimentoId === "string" && Number.isFinite(i.quantidade) && i.quantidade > 0)
          .map((i) => ({ id: String(i.id), alimentoId: i.alimentoId, quantidade: i.quantidade, unidade: String(i.unidade ?? "g") }))
      }))
  };
}

export function validarHorario(h) {
  return typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
}

const mapear = (dieta, idRefeicao, fn) => ({
  ...dieta,
  refeicoes: dieta.refeicoes.map((r) => (r.id === idRefeicao ? fn(r) : r))
});

export function adicionarRefeicao(dieta, nome, horario = "") {
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Error("Informe o nome da refeição.");
  const nova = { id: novoId("ref"), nome: limpo.slice(0, 60), horario: validarHorario(horario) ? horario : "", itens: [] };
  return { ...dieta, refeicoes: [...dieta.refeicoes, nova] };
}

export function removerRefeicao(dieta, idRefeicao) {
  return { ...dieta, refeicoes: dieta.refeicoes.filter((r) => r.id !== idRefeicao) };
}

export function editarRefeicao(dieta, idRefeicao, { nome, horario }) {
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Error("Informe o nome da refeição.");
  if (horario && !validarHorario(horario)) throw new Error("Horário no formato HH:MM.");
  return mapear(dieta, idRefeicao, (r) => ({ ...r, nome: limpo.slice(0, 60), horario: horario || "" }));
}

/* Move a refeição uma posição para cima (-1) ou para baixo (+1). */
export function moverRefeicao(dieta, idRefeicao, direcao) {
  const lista = [...dieta.refeicoes];
  const i = lista.findIndex((r) => r.id === idRefeicao);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return dieta;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return { ...dieta, refeicoes: lista };
}

export function adicionarItem(dieta, idRefeicao, { alimentoId, quantidade, unidade }) {
  if (!(Number.isFinite(quantidade) && quantidade > 0)) throw new Error("Quantidade maior que zero.");
  const item = { id: novoId("item"), alimentoId, quantidade, unidade };
  return mapear(dieta, idRefeicao, (r) => ({ ...r, itens: [...r.itens, item] }));
}

export function editarItem(dieta, idRefeicao, idItem, { quantidade, unidade }) {
  if (!(Number.isFinite(quantidade) && quantidade > 0)) throw new Error("Quantidade maior que zero.");
  return mapear(dieta, idRefeicao, (r) => ({
    ...r,
    itens: r.itens.map((i) => (i.id === idItem ? { ...i, quantidade, unidade: unidade ?? i.unidade } : i))
  }));
}

export function removerItem(dieta, idRefeicao, idItem) {
  return mapear(dieta, idRefeicao, (r) => ({ ...r, itens: r.itens.filter((i) => i.id !== idItem) }));
}

/* ---------- contas ---------- */

function zerado() {
  return {
    kcal: 0,
    proteina: 0,
    proteinaAnimal: 0,
    proteinaVegetal: 0,
    proteinaSemTipo: 0,
    carboidrato: 0,
    gordura: 0,
    gramas: 0,
    /* nutriente → nomes dos alimentos sem dado publicado */
    incompleto: {}
  };
}

const num = (v) => (typeof v === "number" ? v : 0); // "Tr" conta como zero

function somarEm(total, parcial) {
  for (const k of ["kcal", "proteina", "proteinaAnimal", "proteinaVegetal", "proteinaSemTipo", "carboidrato", "gordura", "gramas"]) {
    total[k] += parcial[k];
  }
  for (const [k, nomes] of Object.entries(parcial.incompleto)) {
    total.incompleto[k] = [...new Set([...(total.incompleto[k] ?? []), ...nomes])];
  }
  return total;
}

/* Totais de um item. `buscarAlimento(id)` devolve o alimento ou null (ex.: alimento próprio apagado). */
export function totaisItem(item, buscarAlimento) {
  const t = zerado();
  const alimento = buscarAlimento(item.alimentoId);
  if (!alimento) {
    t.incompleto.alimento = ["alimento removido"];
    return t;
  }
  const r = calcular(alimento, item.quantidade, item.unidade);
  if (!r) {
    t.incompleto.alimento = [alimento.nome];
    return t;
  }
  t.gramas = r.gramas;
  for (const k of MACROS) {
    const v = r.nutrientes[k];
    if (v === null) t.incompleto[k] = [alimento.nome];
    t[k] = num(v);
  }
  const p = t.proteina;
  if (alimento.tipoProteina === "animal") t.proteinaAnimal = p;
  else if (alimento.tipoProteina === "vegetable") t.proteinaVegetal = p;
  else t.proteinaSemTipo = p; // "mixed" ou não classificado: não se adivinha a divisão
  return t;
}

export function totaisRefeicao(refeicao, buscarAlimento) {
  return refeicao.itens.reduce((acc, item) => somarEm(acc, totaisItem(item, buscarAlimento)), zerado());
}

export function totaisDia(dieta, buscarAlimento) {
  return dieta.refeicoes.reduce((acc, r) => somarEm(acc, totaisRefeicao(r, buscarAlimento)), zerado());
}

/* ---------- comparação com a meta ---------- */

/*
 * Estado do progresso (especificação, item 2): abaixo, próximo, atingido, acima.
 * As faixas são uma convenção do app, configurável em PROGRESSO (default-data.js),
 * não uma recomendação nutricional.
 */
export function estadoProgresso(consumido, meta) {
  if (!(meta > 0)) return null;
  const f = consumido / meta;
  if (f < PROGRESSO.proximo) return "abaixo";
  if (f < PROGRESSO.atingido) return "proximo";
  if (f <= PROGRESSO.acima) return "atingido";
  return "acima";
}

export const ROTULO_ESTADO = {
  abaixo: "abaixo da meta",
  proximo: "próximo da meta",
  atingido: "meta atingida",
  acima: "acima da meta"
};

/*
 * Linhas do resumo diário (especificação, item 7): consumido, meta, diferença,
 * % da meta, consumido/kg e meta/kg, para calorias e os três macros.
 */
export function resumoDiario(totais, metas, peso) {
  const linhas = [
    ["kcal", "Calorias", "kcal", metas.kcal],
    ["proteina", "Proteína", "g", metas.proteina],
    ["carboidrato", "Carboidrato", "g", metas.carboidrato],
    ["gordura", "Gordura", "g", metas.gordura]
  ];
  return linhas.map(([chave, rotulo, unidade, meta]) => {
    const consumido = totais[chave];
    return {
      chave,
      rotulo,
      unidade,
      consumido,
      meta,
      diferenca: consumido - meta,
      percentual: meta > 0 ? (consumido / meta) * 100 : null,
      consumidoPorKg: peso > 0 ? consumido / peso : null,
      metaPorKg: peso > 0 ? meta / peso : null,
      estado: estadoProgresso(consumido, meta),
      incompleto: totais.incompleto[chave] ?? []
    };
  });
}

/* ---------- dia de exemplo (fictício) ---------- */

/*
 * Um dia simples, montado só com alimentos da TACO, para quem abre o app com o perfil
 * de demonstração ver a tela funcionando. Não é recomendação nem plano de ninguém.
 */
export function diaDeExemplo() {
  const d = dietaPadrao();
  const itens = {
    "Café da manhã": [["taco-53", 2, "unidade"], ["taco-488", 2, "unidade"], ["taco-226", 1, "fatia"], ["taco-471", 1, "xicara_de_cafe"]],
    Almoço: [["taco-3", 150, "g"], ["taco-561", 1, "concha"], ["taco-410", 120, "g"], ["taco-78", 1, "porcao"], ["taco-157", 1, "unidade"]],
    "Lanche da tarde": [["taco-448", 1, "copo_americano"], ["taco-182", 1, "unidade"], ["taco-7", 2, "colher_de_sopa"]],
    Jantar: [["taco-91", 200, "g"], ["taco-410", 120, "g"], ["taco-100", 1, "porcao"]]
  };
  const horarios = { "Café da manhã": "07:00", Almoço: "12:30", "Lanche da tarde": "16:00", Jantar: "19:30" };
  let dieta = { ...d, refeicoes: d.refeicoes.filter((r) => r.nome in itens) };
  for (const r of dieta.refeicoes) {
    dieta = editarRefeicao(dieta, r.id, { nome: r.nome, horario: horarios[r.nome] });
    for (const [alimentoId, quantidade, unidade] of itens[r.nome]) {
      dieta = adicionarItem(dieta, r.id, { alimentoId, quantidade, unidade });
    }
  }
  return dieta;
}
