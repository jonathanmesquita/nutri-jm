/*
 * Nutri JM — tela. Fases 1 e 2: estrutura, navegação, armazenamento,
 * configurações, TMB, GCD/TDEE, objetivo, metas de macros e IMC.
 * As outras áreas aparecem na navegação, mas dizem em que fase chegam.
 *
 * Todo texto entra por textContent (via h()); nada de innerHTML.
 */

import { storage } from "./storage.js";
import { resumo, validarPerfil, porKg } from "./calculations.js";
import { criarTelaAlimentos } from "./tela-alimentos.js";
import { criarTelaDieta, lerDieta, metasDoPerfil } from "./tela-dieta.js";
import { criarCatalogo } from "./catalogo.js";
import { criarTelaCorpo, lerMedicoes, dataBr } from "./tela-corpo.js";
import { ultimaMedicao } from "./body.js";
import { criarTelaMedicacao } from "./tela-medicacao.js";
import { totaisDia, resumoDiario, ROTULO_ESTADO } from "./diet.js";
import {
  APP,
  FATORES_ATIVIDADE,
  OBJETIVOS,
  PERFIL_DEMONSTRACAO
} from "../../data/default-data.js";

const conteudo = document.querySelector("#conteudo");
const navegacao = document.querySelectorAll("[data-rota]");

/* ---------- utilitários ---------- */

function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

const numero = (valor, casas = 0) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
const fator = (valor) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(valor);
const sinal = (valor) => (valor > 0 ? `+${numero(valor)}` : numero(valor));

/* ---------- perfil ---------- */

function lerPerfil() {
  return storage.get("perfil");
}

function salvarPerfil(perfil) {
  return storage.set("perfil", perfil);
}

function rotuloFator(valor) {
  const faixa = FATORES_ATIVIDADE.find((f) => valor >= f.min - 1e-9 && valor <= f.max + 1e-9);
  return faixa ? faixa.rotulo : "Personalizado";
}

/* ---------- telas ---------- */

function telaBoasVindas() {
  return h(
    "section",
    { class: "cartao", "aria-labelledby": "titulo-tela" },
    h("h1", { id: "titulo-tela" }, `Bem-vindo ao ${APP.nome}`),
    h(
      "p",
      {},
      "Registre seu perfil para calcular gasto diário, meta calórica e metas de macronutrientes. Tudo fica salvo só neste navegador."
    ),
    h(
      "div",
      { class: "acoes" },
      h("a", { class: "botao botao-principal", href: "#configuracoes" }, "Começar com meus dados"),
      h(
        "button",
        {
          type: "button",
          class: "botao",
          onclick: () => {
            salvarPerfil({ ...PERFIL_DEMONSTRACAO });
            irPara("hoje");
          }
        },
        "Ver com perfil de demonstração"
      )
    ),
    avisoSaude()
  );
}

function linha(rotulo, valor, extra) {
  return h(
    "div",
    { class: "linha" },
    h("dt", {}, rotulo),
    h("dd", {}, valor, extra ? h("span", { class: "extra" }, extra) : null)
  );
}

function telaHoje() {
  const perfil = lerPerfil();
  if (!perfil) return telaBoasVindas();

  const r = resumo(perfil);
  const objetivo = OBJETIVOS[perfil.objetivo]?.rotulo ?? "—";
  const fonteTmb = r.tmb.fonte === "medida" ? "medida (bioimpedância)" : "calculada (Harris-Benedict)";

  const macros = [
    ["Proteína", r.macros.proteina, r.macros.kcal.proteina],
    ["Carboidrato", r.macros.carboidrato, r.macros.kcal.carboidrato],
    ["Gordura", r.macros.gordura, r.macros.kcal.gordura]
  ];

  return h(
    "div",
    { class: "pilha" },
    h(
      "header",
      { class: "cabecalho-tela" },
      h("h1", { id: "titulo-tela" }, "Hoje"),
      h("p", { class: "sutil" }, perfil.nome)
    ),

    h(
      "section",
      { class: "cartao", "aria-labelledby": "t-perfil" },
      h("h2", { id: "t-perfil" }, "Perfil"),
      h("dl", { class: "lista" }, linha("Peso atual", `${numero(perfil.peso, 1)} kg`, (() => { const m = ultimaMedicao(lerMedicoes(storage)); return m ? `última medição: ${dataBr(m.data)}` : null; })()), linha("Objetivo", objetivo))
    ),

    h(
      "section",
      { class: "cartao", "aria-labelledby": "t-energia" },
      h("h2", { id: "t-energia" }, "Energia"),
      h(
        "dl",
        { class: "lista" },
        linha("TMB", `${numero(r.tmb.valor)} kcal`, fonteTmb),
        linha("Fator de atividade (FA)", fator(perfil.fatorAtividade), rotuloFator(perfil.fatorAtividade)),
        linha("GCD / TDEE", `${numero(r.gcd)} kcal`),
        linha("Ajuste do objetivo", `${sinal(r.ajuste)} kcal`),
        linha("Meta calórica", `${numero(r.meta)} kcal`)
      ),
      r.tmb.fonte === "medida"
        ? h("p", { class: "nota" }, `Pela fórmula, a TMB seria ${numero(r.tmb.calculada)} kcal.`)
        : null,
      h("p", { class: "nota" }, "GCD/TDEE é uma estimativa de gasto diário. Não é automaticamente a meta da dieta.")
    ),

    consumoDeHoje(perfil),

    h(
      "section",
      { class: "cartao", "aria-labelledby": "t-macros" },
      h("h2", { id: "t-macros" }, "Metas de macronutrientes"),
      h(
        "div",
        { class: "tabela-rolagem", tabindex: "0", role: "region", "aria-label": "Tabela de metas de macronutrientes" },
        h(
          "table",
          {},
          h("caption", { class: "visually-hidden" }, "Meta diária por macronutriente"),
          h(
            "thead",
            {},
            h("tr", {}, h("th", { scope: "col" }, "Macro"), h("th", { scope: "col" }, "Meta"), h("th", { scope: "col" }, "g/kg"), h("th", { scope: "col" }, "kcal"))
          ),
          h(
            "tbody",
            {},
            macros.map(([nome, gramas, kcal]) =>
              h(
                "tr",
                {},
                h("th", { scope: "row" }, nome),
                h("td", {}, `${numero(gramas)} g`),
                h("td", {}, numero(porKg(gramas, perfil.peso), 2)),
                h("td", {}, numero(kcal))
              )
            )
          )
        )
      ),
      r.macros.excesso > 0
        ? h(
            "p",
            { class: "alerta", role: "status" },
            `Proteína e gordura somam ${numero(r.macros.excesso)} kcal a mais que a meta, então não sobra carboidrato. Revise as metas em g/kg ou o objetivo.`
          )
        : null,
      h("p", { class: "nota" }, "Proteína e gordura saem do peso (g/kg); o carboidrato é o que sobra da meta.")
    ),

    h(
      "section",
      { class: "cartao", "aria-labelledby": "t-imc" },
      h("h2", { id: "t-imc" }, "IMC"),
      h(
        "dl",
        { class: "lista" },
        linha("IMC", numero(r.imc.valor, 1), r.imc.classe),
        linha("Altura", `${numero(perfil.altura)} cm`)
      ),
      h(
        "p",
        { class: "nota" },
        "O IMC não diferencia massa muscular de gordura corporal e deve ser interpretado apenas como indicador geral."
      )
    ),

    avisoSaude()
  );
}

/* Consumido × meta, com barra e estado escrito (a cor nunca é a única pista). */
function consumoDeHoje(perfil) {
  const catalogo = criarCatalogo(storage);
  const dieta = lerDieta(storage);
  const total = totaisDia(dieta, catalogo.buscar);
  const linhas = resumoDiario(total, metasDoPerfil(perfil, resumo), perfil.peso);
  const vazia = dieta.refeicoes.every((r) => !r.itens.length);
  const fmt = (v, casas = 0) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);

  return h(
    "section",
    { class: "cartao", "aria-labelledby": "t-consumo" },
    h("h2", { id: "t-consumo" }, "Consumo de hoje"),
    vazia
      ? h("p", {}, "Nenhum alimento na dieta ainda. ", h("a", { href: "#dieta" }, "Montar a dieta do dia"), ".")
      : h(
          "ul",
          { class: "progresso-lista" },
          linhas.map((l) => {
            const casas = l.chave === "kcal" ? 0 : 1;
            const barra = h("span", { class: "barra-preenchida" });
            /* largura pelo CSSOM: a CSP do app não aceita atributo style */
            barra.style.width = `${Math.min(100, Math.max(0, l.percentual ?? 0))}%`;
            const falta = l.diferenca < 0 ? `faltam ${fmt(-l.diferenca, casas)} ${l.unidade}` : l.diferenca > 0 ? `${fmt(l.diferenca, casas)} ${l.unidade} acima` : "exato";
            return h(
              "li",
              { class: `progresso estado-${l.estado ?? "nenhum"}` },
              h(
                "div",
                { class: "progresso-topo" },
                h("span", { class: "progresso-nome" }, l.rotulo),
                h("span", { class: "progresso-valor" }, `${fmt(l.consumido, casas)} / ${fmt(l.meta, casas)} ${l.unidade}`)
              ),
              h("span", { class: "barra", "aria-hidden": "true" }, barra),
              h(
                "span",
                { class: "progresso-estado" },
                `${l.percentual === null ? "—" : `${fmt(l.percentual)}%`} · ${ROTULO_ESTADO[l.estado] ?? ""} · ${falta}`,
                l.chave === "proteina" ? ` · ${fmt(l.consumidoPorKg, 2)} g/kg` : "",
                l.chave === "carboidrato" ? ` · ${fmt(l.consumidoPorKg, 2)} g/kg` : ""
              )
            );
          })
        ),
    !vazia && Object.keys(total.incompleto).length
      ? h("p", { class: "alerta" }, "Total parcial: há alimento sem todos os valores publicados na fonte. Detalhes na aba Dieta.")
      : null,
    vazia ? null : h("p", { class: "nota" }, h("a", { href: "#dieta" }, "Ver a dieta e o resumo completo"))
  );
}

function avisoSaude() {
  return h(
    "p",
    { class: "aviso-saude" },
    "As informações apresentadas pelo aplicativo são registros e estimativas. Elas não substituem avaliação de nutricionista, médico ou outro profissional de saúde."
  );
}

/* ---------- configurações (também é o formulário da primeira execução) ---------- */

function campo({ id, rotulo, tipo = "number", valor, ajuda, obrigatorio = true }) {
  const ajudaId = ajuda ? `${id}-ajuda` : null;
  return h(
    "div",
    { class: "campo" },
    h("label", { for: id }, rotulo),
    h("input", {
      id,
      name: id,
      /* texto com teclado decimal: type="number" recusa a vírgula de "77,1" */
      type: tipo === "number" ? "text" : tipo,
      value: valor === null || valor === undefined ? "" : String(valor).replace(".", ","),
      inputmode: tipo === "number" ? "decimal" : null,
      autocomplete: "off",
      required: obrigatorio,
      "aria-describedby": [ajudaId, `${id}-erro`].filter(Boolean).join(" ")
    }),
    ajuda ? h("p", { class: "ajuda", id: ajudaId }, ajuda) : null,
    h("p", { class: "erro", id: `${id}-erro`, "aria-live": "polite" })
  );
}

function telaConfiguracoes() {
  const atual = lerPerfil() ?? { ...PERFIL_DEMONSTRACAO, nome: "" };

  const seletorFator = h(
    "select",
    { id: "nivelAtividade", "aria-describedby": "nivelAtividade-ajuda" },
    FATORES_ATIVIDADE.map((f) =>
      h(
        "option",
        { value: String(f.min) },
        `${f.rotulo} (${f.min === f.max ? fator(f.min) : `${fator(f.min)} a ${fator(f.max)}`})`
      )
    ),
    h("option", { value: "personalizado" }, "Personalizado")
  );
  const ajudaFator = h("p", { class: "ajuda", id: "nivelAtividade-ajuda" });

  const seletorObjetivo = h(
    "select",
    { id: "objetivo", name: "objetivo" },
    Object.entries(OBJETIVOS).map(([chave, o]) =>
      h("option", { value: chave }, o.ajuste === null ? o.rotulo : `${o.rotulo} (${sinal(o.ajuste)} kcal)`)
    )
  );

  const campoAjuste = campo({
    id: "ajustePersonalizado",
    rotulo: "Ajuste personalizado (kcal)",
    valor: atual.ajustePersonalizado,
    ajuda: "Negativo para déficit, positivo para superávit.",
    obrigatorio: false
  });

  const form = h(
    "form",
    { class: "cartao formulario", novalidate: true },
    h(
      "fieldset",
      {},
      h("legend", {}, "Você"),
      campo({ id: "nome", rotulo: "Nome", tipo: "text", valor: atual.nome }),
      campo({ id: "peso", rotulo: "Peso (kg)", valor: atual.peso }),
      campo({ id: "altura", rotulo: "Altura (cm)", valor: atual.altura }),
      campo({ id: "idade", rotulo: "Idade", valor: atual.idade }),
      h(
        "p",
        { class: "ajuda" },
        "A TMB calculada usa a equação de Harris-Benedict definida para o projeto (forma de referência masculina). Se tiver a TMB de um exame, use-a abaixo."
      )
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "Taxa metabólica basal (TMB)"),
      campo({
        id: "tmbMedida",
        rotulo: "TMB medida (kcal) — opcional",
        valor: atual.tmbMedida,
        ajuda: "Valor de bioimpedância ou outro exame.",
        obrigatorio: false
      }),
      h(
        "div",
        { class: "opcoes", role: "radiogroup", "aria-label": "Fonte da TMB" },
        h(
          "label",
          {},
          h("input", { type: "radio", name: "fonteTmb", value: "medida", checked: atual.fonteTmb === "medida" }),
          " Usar a TMB medida"
        ),
        h(
          "label",
          {},
          h("input", { type: "radio", name: "fonteTmb", value: "calculada", checked: atual.fonteTmb !== "medida" }),
          " Calcular por Harris-Benedict"
        )
      )
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "Atividade e objetivo"),
      h("div", { class: "campo" }, h("label", { for: "nivelAtividade" }, "Nível de atividade"), seletorFator, ajudaFator),
      campo({ id: "fatorAtividade", rotulo: "Fator de atividade (FA)", valor: atual.fatorAtividade }),
      h("div", { class: "campo" }, h("label", { for: "objetivo" }, "Objetivo"), seletorObjetivo),
      campoAjuste
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "Metas de macronutrientes"),
      campo({ id: "proteinaPorKg", rotulo: "Proteína (g por kg)", valor: atual.proteinaPorKg }),
      campo({ id: "gorduraPorKg", rotulo: "Gordura (g por kg)", valor: atual.gorduraPorKg }),
      h("p", { class: "ajuda" }, "O carboidrato é o que sobra da meta calórica.")
    ),
    h("p", { class: "erro-geral", role: "alert" }),
    h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Salvar"))
  );

  const inputFator = form.querySelector("#fatorAtividade");

  function sincronizarNivel() {
    const v = Number(inputFator.value.replace(",", "."));
    const faixa = FATORES_ATIVIDADE.find((f) => v >= f.min - 1e-9 && v <= f.max + 1e-9);
    seletorFator.value = faixa ? String(faixa.min) : "personalizado";
    ajudaFator.textContent = faixa ? faixa.descricao : "Valor fora das faixas de referência.";
  }

  seletorFator.addEventListener("change", () => {
    if (seletorFator.value !== "personalizado") inputFator.value = seletorFator.value.replace(".", ",");
    sincronizarNivel();
  });
  inputFator.addEventListener("input", sincronizarNivel);

  seletorObjetivo.value = atual.objetivo in OBJETIVOS ? atual.objetivo : "manutencao";
  const mostrarAjuste = () => {
    campoAjuste.hidden = seletorObjetivo.value !== "personalizado";
  };
  seletorObjetivo.addEventListener("change", mostrarAjuste);
  mostrarAjuste();
  sincronizarNivel();

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const dados = new FormData(form);
    const num = (k) => {
      const t = String(dados.get(k) ?? "").replace(",", ".").trim();
      return t === "" ? null : Number(t);
    };
    const perfil = {
      nome: String(dados.get("nome") ?? "").trim(),
      peso: num("peso"),
      altura: num("altura"),
      idade: num("idade"),
      tmbMedida: num("tmbMedida"),
      fonteTmb: dados.get("fonteTmb") === "medida" ? "medida" : "calculada",
      fatorAtividade: num("fatorAtividade"),
      objetivo: String(dados.get("objetivo")),
      ajustePersonalizado: num("ajustePersonalizado") ?? 0,
      proteinaPorKg: num("proteinaPorKg"),
      gorduraPorKg: num("gorduraPorKg")
    };

    const erros = validarPerfil(perfil);
    if (perfil.fonteTmb === "medida" && perfil.tmbMedida === null) {
      erros.tmbMedida = "Para usar a TMB medida, informe o valor — ou escolha calcular.";
    }

    form.querySelectorAll(".erro").forEach((p) => (p.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    const chaves = Object.keys(erros);
    for (const chave of chaves) {
      const input = form.querySelector(`#${chave}`);
      const msg = form.querySelector(`#${chave}-erro`);
      if (input) input.setAttribute("aria-invalid", "true");
      if (msg) msg.textContent = erros[chave];
    }
    const geral = form.querySelector(".erro-geral");
    if (chaves.length) {
      geral.textContent = `Revise ${chaves.length === 1 ? "1 campo" : `${chaves.length} campos`}.`;
      form.querySelector(`#${chaves[0]}`)?.focus();
      return;
    }
    geral.textContent = "";
    if (!salvarPerfil(perfil)) {
      geral.textContent = "Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio).";
      return;
    }
    irPara("hoje");
  });

  return h(
    "div",
    { class: "pilha" },
    h("header", { class: "cabecalho-tela" }, h("h1", { id: "titulo-tela" }, "Configurações")),
    form,
    lerPerfil()
      ? h(
          "section",
          { class: "cartao", "aria-labelledby": "t-apagar" },
          h("h2", { id: "t-apagar" }, "Dados deste navegador"),
          h("p", {}, "Tudo fica salvo só aqui. Apagar remove o perfil e volta para a tela inicial."),
          h(
            "button",
            {
              type: "button",
              class: "botao botao-perigo",
              onclick: () => {
                if (window.confirm("Apagar o perfil salvo neste navegador?")) {
                  storage.remove("perfil");
                  irPara("hoje");
                }
              }
            },
            "Apagar meus dados"
          )
        )
      : null
  );
}

const GLOSSARIO = [
  ["TMB", "Quantidade estimada de energia que o corpo utiliza em repouso para manter funções vitais."],
  ["GCD / TDEE", "Estimativa do gasto energético diário considerando metabolismo basal e nível de atividade."],
  ["FA", "Fator de atividade usado como multiplicador da TMB para estimar o gasto energético diário."],
  ["Macronutrientes", "Proteínas, carboidratos e gorduras, nutrientes utilizados pelo corpo em maiores quantidades."],
  ["kcal", "Unidade utilizada para representar energia dos alimentos."],
  ["g/kg", "Quantidade de um nutriente em gramas para cada quilograma de peso corporal."],
  ["IMC", "Relação entre peso e altura. Não diferencia massa muscular de gordura."],
  ["TACO", "Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP, 4ª ed., 2011). É a fonte dos valores nutricionais do app, por 100 g de parte comestível."],
  ["Traço", "Quantidade presente, mas abaixo do limite que a análise consegue medir. Entra na conta como zero."],
  ["— (sem dado)", "A fonte não publica esse valor. O app não estima: deixa em branco."],
  ["Bioimpedância", "Exame que estima a composição do corpo pela passagem de uma corrente elétrica fraca. Os valores são estimativas do aparelho e variam com hidratação e horário."],
  ["Gordura corporal (%)", "Parte do peso que é gordura, segundo a estimativa do aparelho de bioimpedância."],
  ["Músculo esquelético (%)", "Parte do peso que é músculo ligado ao esqueleto, segundo a estimativa do aparelho."],
  ["Gordura visceral", "Índice que o aparelho dá para a gordura ao redor dos órgãos. A escala muda de um fabricante para outro."],
  ["Idade corporal", "Número que alguns aparelhos calculam comparando as medidas com uma referência própria. Não é exame médico."]
];

function telaGlossario() {
  return h(
    "div",
    { class: "pilha" },
    h("header", { class: "cabecalho-tela" }, h("h1", { id: "titulo-tela" }, "Glossário")),
    h(
      "section",
      { class: "cartao" },
      h(
        "dl",
        { class: "glossario" },
        GLOSSARIO.map(([termo, def]) => [h("dt", {}, termo), h("dd", {}, def)])
      )
    ),
    avisoSaude()
  );
}

const EM_BREVE = {
  compras: ["Compras", "Lista manual e gerada a partir do plano alimentar.", 6]
};

function telaEmBreve(rota) {
  const [titulo, descricao, fase] = EM_BREVE[rota];
  return h(
    "div",
    { class: "pilha" },
    h("header", { class: "cabecalho-tela" }, h("h1", { id: "titulo-tela" }, titulo)),
    h("section", { class: "cartao" }, h("p", {}, descricao), h("p", { class: "nota" }, `Chega na fase ${fase}.`))
  );
}

/* ---------- roteamento por hash ---------- */

const ROTAS = {
  hoje: telaHoje,
  configuracoes: telaConfiguracoes,
  glossario: telaGlossario,
  dieta: criarTelaDieta({ h, numero, storage, avisoSaude, lerPerfil, resumo }),
  alimentos: criarTelaAlimentos({ h, numero, storage, avisoSaude }),
  corpo: criarTelaCorpo({ h, storage, avisoSaude, lerPerfil, salvarPerfil }),
  compras: () => telaEmBreve("compras"),
  medicacao: criarTelaMedicacao({ h, storage })
};

/* "#medicacao/estoque" → ["medicacao", "estoque"]: a subseção vai para a tela. */
function rotaAtual() {
  const [r, sub] = location.hash.replace("#", "").split("/");
  return r in ROTAS ? [r, sub] : ["hoje", undefined];
}

function irPara(rota) {
  if (location.hash === `#${rota}`) render();
  else location.hash = rota;
}

function render() {
  const [rota, sub] = rotaAtual();
  conteudo.replaceChildren(ROTAS[rota](sub));
  navegacao.forEach((link) => {
    if (link.dataset.rota === rota) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = `${conteudo.querySelector("h1")?.textContent ?? APP.nome} — ${APP.nome}`;
  /* Leva o foco ao título da nova tela, para leitor de tela e teclado. */
  const titulo = conteudo.querySelector("h1");
  if (titulo && document.activeElement !== document.body) {
    titulo.setAttribute("tabindex", "-1");
    titulo.focus();
  }
}

window.addEventListener("hashchange", render);
render();

/* ---------- PWA: cache para abrir offline depois do primeiro acesso ---------- */

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    /* sem service worker o app funciona normalmente, só não abre offline */
  });
}
