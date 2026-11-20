/*
 * Lista de compras: itens manuais e itens gerados a partir da dieta. Sem DOM.
 *
 * Salvo em storage("compras"):
 *   { versao: 1, diasGerados, itens: [{ id, nome, grupo, status, origem: "manual" | "dieta",
 *     alimentoId?, gramas? }] }
 *
 * Gerar de novo a partir da dieta troca só os itens de origem "dieta" — os manuais ficam —
 * e mantém o status de quem já estava na lista ("já tenho", "comprado"…).
 */

import { totaisItem } from "./diet.js";

export const GRUPOS = {
  proteinas: "Proteínas",
  carboidratos: "Carboidratos",
  frutas: "Frutas",
  verduras: "Verduras / legumes",
  laticinios: "Laticínios",
  despensa: "Despensa",
  suplementos: "Suplementos",
  outros: "Outros"
};

export const STATUS = {
  comprar: "Comprar",
  tenho: "Já tenho",
  comprado: "Comprado",
  ignorar: "Ignorar"
};

/* Categoria do alimento → grupo da lista. */
const GRUPO_DA_CATEGORIA = {
  protein: "proteinas",
  carbs: "carboidratos",
  fruit: "frutas",
  vegetable: "verduras",
  dairy: "laticinios",
  fat: "despensa",
  supplement: "suplementos",
  other: "outros"
};

export function grupoDoAlimento(alimento) {
  return GRUPO_DA_CATEGORIA[alimento?.categoria] ?? "outros";
}

export function listaVazia() {
  return { versao: 1, diasGerados: 7, itens: [] };
}

export function normalizarLista(bruta) {
  if (!bruta || !Array.isArray(bruta.itens)) return listaVazia();
  return {
    versao: 1,
    diasGerados: Number.isInteger(bruta.diasGerados) && bruta.diasGerados >= 1 && bruta.diasGerados <= 31 ? bruta.diasGerados : 7,
    itens: bruta.itens
      .filter((i) => i && typeof i.id === "string" && typeof i.nome === "string" && i.nome.trim())
      .map((i) => ({
        ...i,
        grupo: i.grupo in GRUPOS ? i.grupo : "outros",
        status: i.status in STATUS ? i.status : "comprar",
        origem: i.origem === "dieta" ? "dieta" : "manual"
      }))
  };
}

export function adicionarManual(lista, { id, nome, grupo }) {
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Error("Informe o item.");
  if (limpo.length > 80) throw new Error("Até 80 caracteres.");
  const repetido = lista.itens.some((i) => i.nome.toLocaleLowerCase("pt-BR") === limpo.toLocaleLowerCase("pt-BR"));
  if (repetido) throw new Error("Esse item já está na lista.");
  return { ...lista, itens: [...lista.itens, { id, nome: limpo, grupo: grupo in GRUPOS ? grupo : "outros", status: "comprar", origem: "manual" }] };
}

export function mudarStatus(lista, id, status) {
  if (!(status in STATUS)) return lista;
  return { ...lista, itens: lista.itens.map((i) => (i.id === id ? { ...i, status } : i)) };
}

export function removerItem(lista, id) {
  return { ...lista, itens: lista.itens.filter((i) => i.id !== id) };
}

/* Tira os comprados e os ignorados: recomeça a lista para a próxima ida ao mercado. */
export function limparConcluidos(lista) {
  return { ...lista, itens: lista.itens.filter((i) => i.status === "comprar" || i.status === "tenho") };
}

/*
 * Gera os itens da dieta para `dias` dias: soma, por alimento, o peso de todas as refeições
 * (convertendo unidade caseira em gramas) e multiplica pelos dias. O peso é do alimento como
 * está na dieta (ex.: arroz cozido) — a tela diz isso, porque não é o peso do pacote cru.
 */
export function gerarDaDieta(lista, dieta, buscarAlimento, dias = 7) {
  const porAlimento = new Map();
  for (const refeicao of dieta.refeicoes) {
    for (const item of refeicao.itens) {
      const alimento = buscarAlimento(item.alimentoId);
      if (!alimento) continue;
      const g = totaisItem(item, buscarAlimento).gramas;
      const atual = porAlimento.get(alimento.id) ?? { alimento, gramas: 0 };
      atual.gramas += g;
      porAlimento.set(alimento.id, atual);
    }
  }
  const anteriores = new Map(lista.itens.filter((i) => i.origem === "dieta").map((i) => [i.alimentoId, i]));
  const gerados = [...porAlimento.values()].map(({ alimento, gramas }) => {
    const antes = anteriores.get(alimento.id);
    return {
      id: antes?.id ?? `dieta-${alimento.id}`,
      nome: alimento.nome,
      grupo: grupoDoAlimento(alimento),
      status: antes?.status ?? "comprar",
      origem: "dieta",
      alimentoId: alimento.id,
      gramas: gramas * dias
    };
  });
  return { ...lista, diasGerados: dias, itens: [...lista.itens.filter((i) => i.origem === "manual"), ...gerados] };
}

/* Itens agrupados na ordem de GRUPOS, e dentro do grupo por nome; grupos vazios saem. */
export function agrupar(itens) {
  return Object.keys(GRUPOS)
    .map((g) => [g, itens.filter((i) => i.grupo === g).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))])
    .filter(([, lista]) => lista.length);
}

export function textoQuantidade(gramas) {
  if (!Number.isFinite(gramas) || gramas <= 0) return "";
  const fmt = (v, casas) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
  return gramas >= 1000 ? `≈ ${fmt(gramas / 1000, 2)} kg` : `≈ ${fmt(Math.round(gramas / 10) * 10, 0)} g`;
}

/* Texto para copiar: só o que falta comprar, agrupado. */
export function textoParaCopiar(lista) {
  const pendentes = lista.itens.filter((i) => i.status === "comprar");
  if (!pendentes.length) return "";
  return agrupar(pendentes)
    .map(([g, itens]) => [GRUPOS[g].toUpperCase(), ...itens.map((i) => `□ ${i.nome}${i.gramas ? ` (${textoQuantidade(i.gramas)})` : ""}`)].join("\n"))
    .join("\n\n");
}
