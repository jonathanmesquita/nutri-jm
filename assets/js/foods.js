/*
 * Alimentos: pesquisa, unidades e calculadora. Sem DOM, para ter teste.
 *
 * Um valor nutricional é sempre um destes três:
 *   número  — publicado na fonte;
 *   "Tr"    — traço (abaixo do limite de quantificação da TACO);
 *   null    — a fonte não publica ("—" na tela). Nunca vira zero sozinho.
 */

import { ALIMENTOS } from "../../data/foods.js";

export const CATEGORIAS = {
  protein: "Proteína",
  carbs: "Carboidrato",
  fat: "Gordura",
  fruit: "Fruta",
  vegetable: "Verdura e legume",
  dairy: "Leite e derivados",
  supplement: "Suplemento",
  other: "Outros"
};

export const TIPOS_PROTEINA = {
  animal: "Animal",
  vegetable: "Vegetal",
  mixed: "Mista"
};

/* Ordem e rótulo dos nutrientes na tela. */
export const NUTRIENTES = [
  { chave: "kcal", rotulo: "Calorias", unidade: "kcal", casas: 0 },
  { chave: "proteina", rotulo: "Proteína", unidade: "g", casas: 1 },
  { chave: "carboidrato", rotulo: "Carboidratos", unidade: "g", casas: 1 },
  { chave: "gordura", rotulo: "Gordura total", unidade: "g", casas: 1 },
  { chave: "fibra", rotulo: "Fibra", unidade: "g", casas: 1 },
  { chave: "sodio", rotulo: "Sódio", unidade: "mg", casas: 0 }
];

/* ---------- pesquisa ---------- */

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "ao"]);

export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function palavras(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p));
}

/* Plural simples: "ovos" acha "ovo", "bananas" acha "banana". */
function casa(termo, palavra) {
  if (palavra.startsWith(termo)) return true;
  return termo.length > 3 && termo.endsWith("s") && palavra.startsWith(termo.slice(0, -1));
}

/*
 * Todas as palavras digitadas precisam aparecer, em qualquer ordem, como começo de uma
 * palavra do nome ("peito frango" acha "Frango, peito, sem pele, cozido"). Ordem do
 * resultado: a primeira palavra do nome casando com a primeira digitada vem antes, e
 * nome mais curto (menos qualificado) antes do mais longo.
 */
export function pesquisar(consulta, lista = ALIMENTOS, limite = 30) {
  const termos = palavras(consulta);
  if (!termos.length) return [];
  const achados = [];
  for (const alimento of lista) {
    const nome = palavras(alimento.nome);
    if (!termos.every((t) => nome.some((p) => casa(t, p)))) continue;
    const pontos = (casa(termos[0], nome[0]) ? 0 : 1000) + alimento.nome.length;
    achados.push([pontos, alimento]);
  }
  achados.sort((a, b) => a[0] - b[0]);
  return achados.slice(0, limite).map(([, a]) => a);
}

/* ---------- unidades ---------- */

/* Unidades que a pessoa pode escolher para um alimento: sempre gramas, mais as medidas
   caseiras que têm peso publicado. Mililitro não entra: a TACO é por 100 g e converter
   volume em massa exigiria uma densidade que a fonte não dá. */
export function unidadesDe(alimento) {
  const lista = [{ chave: "g", nome: "g", gramas: 1 }];
  for (const m of alimento.medidas ?? []) lista.push(m);
  return lista;
}

export function gramasDe(alimento, quantidade, chaveUnidade = "g") {
  const unidade = unidadesDe(alimento).find((u) => u.chave === chaveUnidade);
  if (!unidade || !Number.isFinite(quantidade) || quantidade < 0) return null;
  return quantidade * unidade.gramas;
}

/*
 * Ao trocar a unidade, mantém o mesmo peso: 250 g de arroz viram 2,5 conchas (100 g cada),
 * não 250 conchas. Arredonda para uma casa (duas abaixo de 1), que é o que se digita.
 */
export function converterQuantidade(alimento, quantidade, de, para) {
  const gramas = gramasDe(alimento, quantidade, de);
  const destino = unidadesDe(alimento).find((u) => u.chave === para);
  if (gramas === null || !destino) return null;
  const bruto = gramas / destino.gramas;
  const casas = bruto < 1 ? 100 : 10;
  return Math.round(bruto * casas) / casas || (bruto > 0 ? 0.01 : 0);
}

/* ---------- calculadora ---------- */

/* result = (nutrientePor100 × quantidade) / 100, mantendo "Tr" e null como estão. */
export function nutrientesPara(alimento, gramas) {
  const resultado = {};
  for (const { chave } of NUTRIENTES) {
    const v = alimento.por100[chave];
    resultado[chave] = typeof v === "number" ? (v * gramas) / 100 : v ?? null;
  }
  return resultado;
}

export function calcular(alimento, quantidade, chaveUnidade = "g") {
  const gramas = gramasDe(alimento, quantidade, chaveUnidade);
  if (gramas === null) return null;
  return { gramas, nutrientes: nutrientesPara(alimento, gramas) };
}

/* ---------- alimentos cadastrados por quem usa ---------- */

const LIMITES = { kcal: 900, proteina: 100, carboidrato: 100, gordura: 100, fibra: 100, sodio: 40000 };

/* Valida um alimento digitado (valores por 100 g, tirados do rótulo). Devolve {campo: mensagem}. */
export function validarAlimento(a) {
  const erros = {};
  if (!a.nome || !a.nome.trim()) erros.nome = "Informe o nome.";
  if (!(a.categoria in CATEGORIAS)) erros.categoria = "Escolha uma categoria.";
  for (const [chave, max] of Object.entries(LIMITES)) {
    const v = a.por100?.[chave];
    if (v === null || v === undefined) {
      if (chave === "kcal") erros.kcal = "Informe as calorias por 100 g.";
      continue;
    }
    if (!Number.isFinite(v) || v < 0 || v > max) erros[chave] = `Entre 0 e ${max}.`;
  }
  if (a.gramasPorUnidade !== null && a.gramasPorUnidade !== undefined) {
    if (!Number.isFinite(a.gramasPorUnidade) || a.gramasPorUnidade <= 0 || a.gramasPorUnidade > 5000) {
      erros.gramasPorUnidade = "Entre 1 e 5000 g.";
    }
  }
  return erros;
}

/* Converte o que a pessoa digitou no mesmo formato dos alimentos da TACO. */
export function montarAlimentoProprio(dados, id) {
  const medidas = [];
  if (dados.gramasPorUnidade) {
    medidas.push({
      chave: "unidade",
      nome: dados.nomeUnidade?.trim() || "unidade",
      gramas: dados.gramasPorUnidade,
      descricao: "Informado por você"
    });
  }
  return {
    id,
    nome: dados.nome.trim(),
    categoria: dados.categoria,
    tipoProteina: dados.tipoProteina in TIPOS_PROTEINA ? dados.tipoProteina : null,
    unidadePadrao: medidas.length ? "unidade" : "g",
    medidas,
    por100: { ...dados.por100 },
    proprio: true
  };
}
