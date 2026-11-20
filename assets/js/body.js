/*
 * Corpo: medições (bioimpedância e peso), histórico e estágio do avatar. Sem DOM.
 *
 * Medição salva em storage("medicoes"), lista em qualquer ordem:
 *   { id, data: "AAAA-MM-DD", peso, altura, gorduraPct, musculoPct, gorduraVisceral,
 *     tmbMedida, idadeCorporal, observacao }
 * Só data e peso são obrigatórios; o resto é null quando não foi medido ("—" na tela).
 * O IMC não é guardado: sai do peso e da altura (da medição ou, sem ela, do perfil).
 *
 * São registros de medição, não diagnóstico.
 */

import { ESTAGIOS_AVATAR } from "../../data/default-data.js";
import { imc, classificarImc } from "./calculations.js";

/* campo → [rótulo, mínimo, máximo, obrigatório] */
export const CAMPOS_MEDICAO = {
  peso: ["Peso (kg)", 20, 400, true],
  altura: ["Altura (cm)", 100, 250, false],
  gorduraPct: ["Gordura corporal (%)", 2, 75, false],
  musculoPct: ["Músculo esquelético (%)", 10, 70, false],
  gorduraVisceral: ["Gordura visceral (nível)", 1, 60, false],
  tmbMedida: ["TMB medida (kcal)", 500, 6000, false],
  idadeCorporal: ["Idade corporal (anos)", 10, 120, false]
};

export function validarData(texto, hoje = new Date()) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  const limite = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return a >= 1900 && dt.getTime() <= limite;
}

/* Devolve {campo: mensagem}. */
export function validarMedicao(m, hoje = new Date()) {
  const erros = {};
  if (!validarData(m.data, hoje)) erros.data = "Informe uma data válida, até hoje.";
  for (const [campo, [rotulo, min, max, obrigatorio]] of Object.entries(CAMPOS_MEDICAO)) {
    const v = m[campo];
    if (v === null || v === undefined) {
      if (obrigatorio) erros[campo] = `Informe o ${rotulo.split(" (")[0].toLowerCase()}.`;
      continue;
    }
    if (!Number.isFinite(v) || v < min || v > max) erros[campo] = `Entre ${min} e ${max}.`;
  }
  if (m.observacao && m.observacao.length > 280) erros.observacao = "Até 280 caracteres.";
  return erros;
}

/* Mais recente primeiro; mesma data, a cadastrada por último primeiro. */
export function ordenar(medicoes) {
  return medicoes
    .map((m, i) => [m, i])
    .sort((a, b) => (a[0].data === b[0].data ? b[1] - a[1] : a[0].data < b[0].data ? 1 : -1))
    .map(([m]) => m);
}

export function ultimaMedicao(medicoes) {
  return ordenar(medicoes)[0] ?? null;
}

export function salvarMedicao(medicoes, medicao) {
  const existe = medicoes.some((m) => m.id === medicao.id);
  return existe ? medicoes.map((m) => (m.id === medicao.id ? medicao : m)) : [...medicoes, medicao];
}

export function removerMedicao(medicoes, id) {
  return medicoes.filter((m) => m.id !== id);
}

/* IMC da medição: altura dela, ou a do perfil. null se não houver altura. */
export function imcDaMedicao(medicao, alturaPerfil) {
  const altura = medicao.altura ?? alturaPerfil ?? null;
  if (!(altura > 0) || !(medicao.peso > 0)) return null;
  const valor = imc(medicao.peso, altura);
  return { valor, classe: classificarImc(valor), alturaDoPerfil: medicao.altura == null };
}

/* Diferença para a medição anterior (na ordem do tempo), campo a campo; null onde falta um dos lados. */
export function variacao(medicoes, id) {
  const lista = ordenar(medicoes);
  const i = lista.findIndex((m) => m.id === id);
  const atual = lista[i];
  const anterior = lista[i + 1];
  if (!atual || !anterior) return null;
  const dif = {};
  for (const campo of Object.keys(CAMPOS_MEDICAO)) {
    const a = atual[campo];
    const b = anterior[campo];
    dif[campo] = a == null || b == null ? null : a - b;
  }
  return { anteriorEm: anterior.data, dif };
}

/*
 * Estágio do avatar pelo IMC (especificação, item 15). Representação lúdica: o IMC não é
 * composição corporal, e o estágio não diz nada sobre a pessoa além desse número.
 */
export function estagioAvatar(valorImc) {
  if (!Number.isFinite(valorImc)) return null;
  const i = ESTAGIOS_AVATAR.findIndex((e) => valorImc >= e.min && valorImc < e.max);
  return i < 0 ? null : { numero: i + 1, total: ESTAGIOS_AVATAR.length, ...ESTAGIOS_AVATAR[i] };
}

/*
 * Desenho do avatar em pixel art, como lista de retângulos {x, y, w, h, cor} numa grade de
 * 24 × 32. Só a largura do tronco, braços e pernas muda com o estágio. Sem imagem: a tela
 * monta um <svg> com isso, então não há arquivo de terceiro nem pedido de rede.
 */
export function desenhoAvatar(estagio) {
  const larguraTronco = 6 + estagio.largura; // 7 a 14 px
  const meio = 12;
  const px = [];
  const ret = (x, y, w, h, cor) => px.push({ x, y, w, h, cor });
  const t0 = Math.round(meio - larguraTronco / 2);
  const larguraPerna = Math.max(2, Math.round(larguraTronco / 2) - 1);

  ret(9, 2, 6, 6, "pele"); // cabeça
  ret(9, 1, 6, 2, "cabelo");
  ret(10, 4, 1, 1, "tinta"); // olhos
  ret(13, 4, 1, 1, "tinta");
  ret(11, 6, 2, 1, "tinta"); // boca
  ret(11, 8, 2, 1, "pele"); // pescoço
  ret(t0, 9, larguraTronco, 10, "camisa"); // tronco
  ret(t0 - 2, 10, 2, 8, "camisa"); // braços
  ret(t0 + larguraTronco, 10, 2, 8, "camisa");
  ret(t0 - 2, 18, 2, 2, "pele"); // mãos
  ret(t0 + larguraTronco, 18, 2, 2, "pele");
  ret(t0, 19, larguraTronco, 2, "calca"); // quadril
  ret(t0, 21, larguraPerna, 8, "calca"); // pernas
  ret(t0 + larguraTronco - larguraPerna, 21, larguraPerna, 8, "calca");
  ret(t0 - 1, 29, larguraPerna + 1, 2, "tinta"); // pés
  ret(t0 + larguraTronco - larguraPerna, 29, larguraPerna + 1, 2, "tinta");
  return px;
}

/* ---------- medições de exemplo (fictícias) ---------- */

function diasAtras(hoje, dias) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Três medições inventadas, coerentes com o perfil de demonstração (70 kg, 175 cm). */
export function medicoesDeExemplo(hoje = new Date()) {
  const base = { altura: 175, gorduraVisceral: null, idadeCorporal: null, observacao: "" };
  return [
    { ...base, id: "exemplo-1", data: diasAtras(hoje, 60), peso: 72.4, gorduraPct: 21.5, musculoPct: 38.9, gorduraVisceral: 7, tmbMedida: 1630, idadeCorporal: 33, observacao: "Exemplo fictício" },
    { ...base, id: "exemplo-2", data: diasAtras(hoje, 30), peso: 71.1, gorduraPct: 20.4, musculoPct: 39.5 },
    { ...base, id: "exemplo-3", data: diasAtras(hoje, 2), peso: 70, gorduraPct: 19.6, musculoPct: 40.1, gorduraVisceral: 6, tmbMedida: 1650, idadeCorporal: 31 }
  ];
}
