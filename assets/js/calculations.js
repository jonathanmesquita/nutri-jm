/*
 * Cálculos do Nutri JM, sem DOM — testados com `node --test`.
 * Nenhuma função arredonda: arredondar é papel de quem exibe.
 */

import { OBJETIVOS, KCAL_POR_GRAMA, FAIXAS_IMC } from "../../data/default-data.js";

/*
 * TMB por Harris-Benedict, na forma definida para este projeto:
 *   66,47 + 13,75 × peso(kg) + 5 × altura(cm) − 6,8 × idade
 * É a equação de referência masculina. A especificação não traz a feminina,
 * então o app não pergunta sexo para trocar de fórmula (ver README).
 */
export function tmbHarrisBenedict({ peso, altura, idade }) {
  return 66.47 + 13.75 * peso + 5 * altura - 6.8 * idade;
}

/* Qual TMB está em uso e de onde ela vem. A medida só vale se foi informada. */
export function tmbEmUso(perfil) {
  const calculada = tmbHarrisBenedict(perfil);
  const temMedida = Number.isFinite(perfil.tmbMedida) && perfil.tmbMedida > 0;
  if (perfil.fonteTmb === "medida" && temMedida) {
    return { valor: perfil.tmbMedida, fonte: "medida", calculada };
  }
  return { valor: calculada, fonte: "calculada", calculada };
}

export function gcd(tmb, fatorAtividade) {
  return tmb * fatorAtividade;
}

export function ajusteDoObjetivo(perfil) {
  const objetivo = OBJETIVOS[perfil.objetivo] ?? OBJETIVOS.manutencao;
  return objetivo.ajuste ?? (Number(perfil.ajustePersonalizado) || 0);
}

export function metaCalorica(gcdKcal, ajuste) {
  return gcdKcal + ajuste;
}

/*
 * Proteína e gordura saem de g/kg; o carboidrato é o que sobra da meta.
 * Se proteína + gordura passarem da meta, o carboidrato fica em 0 e
 * `excesso` diz quantas kcal passaram — a tela avisa em vez de mostrar
 * um número negativo.
 */
export function metasDeMacros({ peso, metaKcal, proteinaPorKg, gorduraPorKg }) {
  const proteina = peso * proteinaPorKg;
  const gordura = peso * gorduraPorKg;
  const kcalProteina = proteina * KCAL_POR_GRAMA.proteina;
  const kcalGordura = gordura * KCAL_POR_GRAMA.gordura;
  const kcalCarboidrato = metaKcal - kcalProteina - kcalGordura;

  return {
    proteina,
    gordura,
    carboidrato: Math.max(0, kcalCarboidrato / KCAL_POR_GRAMA.carboidrato),
    kcal: { proteina: kcalProteina, gordura: kcalGordura, carboidrato: Math.max(0, kcalCarboidrato) },
    excesso: kcalCarboidrato < 0 ? -kcalCarboidrato : 0
  };
}

export function imc(peso, alturaCm) {
  const metros = alturaCm / 100;
  return peso / (metros * metros);
}

export function classificarImc(valor) {
  return FAIXAS_IMC.find((faixa) => valor < faixa.ate).rotulo;
}

export function porKg(valor, peso) {
  return valor / peso;
}

/* Tudo o que o painel "Hoje" mostra, a partir do perfil. */
export function resumo(perfil) {
  const tmb = tmbEmUso(perfil);
  const gastoDiario = gcd(tmb.valor, perfil.fatorAtividade);
  const ajuste = ajusteDoObjetivo(perfil);
  const meta = metaCalorica(gastoDiario, ajuste);
  const macros = metasDeMacros({
    peso: perfil.peso,
    metaKcal: meta,
    proteinaPorKg: perfil.proteinaPorKg,
    gorduraPorKg: perfil.gorduraPorKg
  });
  const valorImc = imc(perfil.peso, perfil.altura);

  return {
    tmb,
    gcd: gastoDiario,
    ajuste,
    meta,
    macros,
    imc: { valor: valorImc, classe: classificarImc(valorImc) }
  };
}

/*
 * Confere um perfil vindo do formulário (ou do armazenamento). Devolve a
 * lista de problemas por campo; vazia quando está tudo certo.
 */
export function validarPerfil(p) {
  const erros = {};
  const faixa = (campo, min, max, texto) => {
    const v = p[campo];
    if (!Number.isFinite(v) || v < min || v > max) erros[campo] = texto;
  };
  if (!String(p.nome ?? "").trim()) erros.nome = "Informe um nome.";
  faixa("peso", 20, 400, "Peso entre 20 e 400 kg.");
  faixa("altura", 100, 250, "Altura entre 100 e 250 cm.");
  faixa("idade", 10, 120, "Idade entre 10 e 120 anos.");
  faixa("fatorAtividade", 1, 2.5, "Fator de atividade entre 1,0 e 2,5.");
  faixa("proteinaPorKg", 0, 5, "Proteína entre 0 e 5 g/kg.");
  faixa("gorduraPorKg", 0, 5, "Gordura entre 0 e 5 g/kg.");
  if (p.tmbMedida !== null && p.tmbMedida !== undefined && p.tmbMedida !== "") {
    if (!Number.isFinite(p.tmbMedida) || p.tmbMedida < 500 || p.tmbMedida > 6000) {
      erros.tmbMedida = "TMB medida entre 500 e 6.000 kcal, ou deixe em branco.";
    }
  }
  if (!OBJETIVOS[p.objetivo]) erros.objetivo = "Escolha um objetivo.";
  if (p.objetivo === "personalizado" && !Number.isFinite(p.ajustePersonalizado)) {
    erros.ajustePersonalizado = "Informe o ajuste em kcal (pode ser negativo).";
  }
  return erros;
}
