/*
 * Configuração central do Nutri JM. Tudo o que é regra ajustável mora aqui,
 * não espalhado pelo código (especificação, item 32).
 *
 * O perfil de demonstração é FICTÍCIO de propósito: o código e o site são
 * públicos. Os dados reais de quem usa entram pelo próprio app e ficam só
 * no navegador dessa pessoa.
 */

export const APP = {
  nome: "Nutri JM",
  versaoDados: 1
};

export const FATORES_ATIVIDADE = [
  { min: 1.2, max: 1.2, rotulo: "Sedentário", descricao: "Trabalha sentado e não treina." },
  {
    min: 1.3,
    max: 1.4,
    rotulo: "Levemente ativo",
    descricao: "Treina musculação de 3 a 5 vezes por semana, mas tem rotina predominantemente de escritório."
  },
  {
    min: 1.5,
    max: 1.6,
    rotulo: "Moderadamente ativo",
    descricao: "Treina pesado e tem rotina com movimentação constante ou caminhadas."
  },
  {
    min: 1.7,
    max: 1.9,
    rotulo: "Altamente ativo",
    descricao: "Atletas ou pessoas com trabalho braçal pesado aliado a treinos intensos."
  }
];

/* Ajuste em kcal sobre o GCD/TDEE. "personalizado" usa o valor digitado. */
export const OBJETIVOS = {
  manutencao: { rotulo: "Manutenção", ajuste: 0 },
  cutting: { rotulo: "Cutting", ajuste: -500 },
  bulking: { rotulo: "Bulking", ajuste: 300 },
  personalizado: { rotulo: "Personalizado", ajuste: null }
};

export const MACROS_PADRAO = { proteinaPorKg: 2.0, gorduraPorKg: 1.0 };

export const KCAL_POR_GRAMA = { proteina: 4, carboidrato: 4, gordura: 9 };

/* Faixas de IMC (limite superior exclusivo; a última vai ao infinito). */
export const FAIXAS_IMC = [
  { ate: 18.5, rotulo: "Abaixo do peso" },
  { ate: 25, rotulo: "Peso normal" },
  { ate: 30, rotulo: "Sobrepeso" },
  { ate: 35, rotulo: "Obesidade grau I" },
  { ate: 40, rotulo: "Obesidade grau II" },
  { ate: Infinity, rotulo: "Obesidade grau III" }
];

/*
 * Faixas do progresso consumido ÷ meta (especificação, item 2): abaixo de 85% é "abaixo",
 * de 85% até 97% é "próximo", de 97% a 103% é "atingido", acima de 103% é "acima".
 * Convenção do app para a tela, não recomendação nutricional.
 */
export const PROGRESSO = { proximo: 0.85, atingido: 0.97, acima: 1.03 };

export const REFEICOES_PADRAO = [
  "Pré-treino",
  "Café da manhã",
  "Lanche da manhã",
  "Almoço",
  "Lanche da tarde",
  "Jantar",
  "Ceia",
  "Pós-treino"
];

/* Perfil fictício para quem quer conhecer o app sem digitar nada. */
export const PERFIL_DEMONSTRACAO = {
  nome: "Perfil de demonstração",
  peso: 70,
  altura: 175,
  idade: 30,
  tmbMedida: 1650,
  fonteTmb: "medida",
  fatorAtividade: 1.5,
  objetivo: "manutencao",
  ajustePersonalizado: 0,
  proteinaPorKg: MACROS_PADRAO.proteinaPorKg,
  gorduraPorKg: MACROS_PADRAO.gorduraPorKg
};
