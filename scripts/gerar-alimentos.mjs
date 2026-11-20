/*
 * Gera data/foods.js a partir da TACO (composição, por 100 g) e das medidas caseiras do IBGE.
 *
 *   node scripts/gerar-alimentos.mjs <foods.json> <household.json>
 *
 * Os dois JSON são os dados do pacote npm taco-br-mcp@0.2.0 (data/foods.json e
 * data/household.json), que por sua vez vêm do repositório brolesi/taco no commit
 * b800c910dfc9d2e8e6bab45dd42e5b8f5167b466, conferido célula a célula contra o PDF oficial.
 *
 * Nada é estimado aqui: valor que a TACO não publica fica null ("—" na tela) e traço
 * ("Tr") fica "Tr". O que este script decide é só classificação: a categoria do app e o
 * tipo de proteína, pelas regras de CATEGORIA e EXCECOES abaixo.
 */

import fs from "node:fs";

const [, , arquivoTaco, arquivoMedidas] = process.argv;
if (!arquivoTaco || !arquivoMedidas) {
  console.error("uso: node scripts/gerar-alimentos.mjs <foods.json> <household.json>");
  process.exit(1);
}

const taco = JSON.parse(fs.readFileSync(arquivoTaco, "utf8"));
const medidas = JSON.parse(fs.readFileSync(arquivoMedidas, "utf8"));

/* Categoria da TACO → [categoria do app, tipo de proteína]. A categoria diz a função
   principal do alimento no prato, não que ele só tenha aquele macronutriente. */
const CATEGORIA = {
  "Carnes e derivados": ["protein", "animal"],
  "Pescados e frutos do mar": ["protein", "animal"],
  "Ovos e derivados": ["protein", "animal"],
  "Leguminosas e derivados": ["protein", "vegetable"],
  "Leite e derivados": ["dairy", "animal"],
  "Cereais e derivados": ["carbs", "vegetable"],
  "Verduras, hortaliças e derivados": ["vegetable", "vegetable"],
  "Frutas e derivados": ["fruit", "vegetable"],
  "Nozes e sementes": ["fat", "vegetable"],
  "Gorduras e óleos": ["fat", null],
  "Produtos açucarados": ["other", null],
  "Bebidas (alcoólicas e não alcoólicas)": ["other", null],
  "Miscelâneas": ["other", null],
  "Outros alimentos industrializados": ["other", null],
  "Alimentos preparados": ["other", null]
};

/* Tubérculos estão entre as hortaliças na TACO, mas no prato fazem o papel do carboidrato. */
const TUBERCULOS = /^(Batata|Mandioca|Mandioquinha|Inhame|Cará)\b/;

const valor = (v) => (v && typeof v === "object" && v.trace ? "Tr" : v ?? null);

const porId = new Map(medidas.foods.map((m) => [m.taco_id, m.measures]));

const alimentos = taco.foods.map((f) => {
  let [categoria, tipoProteina] = CATEGORIA[f.category] ?? ["other", null];
  if (categoria === "vegetable" && TUBERCULOS.test(f.name)) categoria = "carbs";

  const n = f.nutrients;
  const listaMedidas = (porId.get(f.id) ?? []).map((m) => ({
    chave: m.key,
    nome: m.measure,
    gramas: m.grams,
    descricao: m.source_description
  }));
  const temUnidade = listaMedidas.some((m) => m.chave === "unidade");
  const unidadePadrao =
    temUnidade && (categoria === "fruit" || f.category === "Ovos e derivados") ? "unidade" : "g";

  return {
    id: `taco-${f.id}`,
    nome: f.name,
    categoria,
    categoriaTaco: f.category,
    tipoProteina,
    unidadePadrao,
    medidas: listaMedidas,
    por100: {
      kcal: valor(n.energy_kcal),
      proteina: valor(n.protein_g),
      carboidrato: valor(n.carbohydrate_g),
      gordura: valor(n.lipids_g),
      fibra: valor(n.dietary_fiber_g),
      sodio: valor(n.sodium_mg)
    }
  };
});

const cabecalho = `/*
 * GERADO por scripts/gerar-alimentos.mjs — não editar à mão.
 *
 * Composição: TACO — Tabela Brasileira de Composição de Alimentos, 4ª ed. ampliada e revisada.
 * NEPA/UNICAMP, 2011. Valores por 100 g de parte comestível. "É permitida a reprodução total
 * ou parcial do material, desde que seja citada a fonte."
 *
 * Medidas caseiras: IBGE, POF 2008–2009, Tabela de Medidas Referidas para os Alimentos
 * Consumidos no Brasil (2011), pelo mapeamento TACO → POF do projeto taco-br-mcp.
 *
 * null = a TACO não publica o valor ("—" na tela). "Tr" = traço, abaixo do limite de
 * quantificação. ${alimentos.length} alimentos.
 */
`;

fs.writeFileSync(
  new URL("../data/foods.js", import.meta.url),
  `${cabecalho}\nexport const FONTE_ALIMENTOS = "TACO 4ª ed. (NEPA/UNICAMP, 2011)";\nexport const FONTE_MEDIDAS = "IBGE, POF 2008–2009";\n\nexport const ALIMENTOS = ${JSON.stringify(alimentos, null, 0)
    .replace(/\},\{"id"/g, '},\n  {"id"')
    .replace(/^\[/, "[\n  ")
    .replace(/\]$/, "\n]")};\n`
);
console.log(`data/foods.js: ${alimentos.length} alimentos`);
