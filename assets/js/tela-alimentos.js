/*
 * Tela "Alimentos" (fase 3): pesquisa na TACO, calculadora por quantidade e alimentos
 * cadastrados por quem usa. Lógica em foods.js; aqui só DOM. Texto sempre por textContent.
 */

import { ALIMENTOS, FONTE_ALIMENTOS, FONTE_MEDIDAS } from "../../data/foods.js";
import {
  CATEGORIAS,
  TIPOS_PROTEINA,
  NUTRIENTES,
  pesquisar,
  unidadesDe,
  calcular,
  validarAlimento,
  montarAlimentoProprio
} from "./foods.js";

const CHAVE_PROPRIOS = "alimentos";

/* O que fica na memória enquanto a pessoa navega entre as abas. */
const estado = { consulta: "", selecionado: null, quantidade: "100", unidade: "g" };

export function criarTelaAlimentos({ h, numero, storage, avisoSaude }) {
  const proprios = () => storage.get(CHAVE_PROPRIOS, []);
  const todos = () => [...proprios(), ...ALIMENTOS];
  const porId = (id) => todos().find((a) => a.id === id) ?? null;

  /* número, "Tr" ou null → texto da tela, sem nunca transformar ausência em zero */
  function valorNutriente(v, { unidade, casas }) {
    if (v === "Tr") return h("span", { title: "Traço: abaixo do limite de quantificação" }, "traço");
    if (v === null || v === undefined) {
      return h("span", {}, h("span", { "aria-hidden": "true" }, "—"), h("span", { class: "visually-hidden" }, "sem dado"));
    }
    /* até `casas` decimais, sem zero à direita: "0 g", "47,3 g", "245 kcal" */
    const texto = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
    return `${texto} ${unidade}`;
  }

  function rotuloCategoria(a) {
    const partes = [CATEGORIAS[a.categoria] ?? "Outros"];
    if (a.tipoProteina) partes.push(`proteína ${TIPOS_PROTEINA[a.tipoProteina].toLowerCase()}`);
    if (a.proprio) partes.push("cadastrado por você");
    return partes.join(" · ");
  }

  return function telaAlimentos() {
    const total = ALIMENTOS.length;

    /* ---------- pesquisa ---------- */

    const campoBusca = h("input", {
      id: "busca-alimento",
      type: "search",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "ex.: peito de frango, arroz, banana",
      value: estado.consulta,
      "aria-describedby": "busca-ajuda",
      "aria-controls": "resultados"
    });
    const contagem = h("p", { class: "nota", id: "busca-contagem", role: "status" });
    const listaResultados = h("ul", { class: "resultados", id: "resultados", "aria-labelledby": "t-busca" });

    function mostrarResultados() {
      estado.consulta = campoBusca.value;
      const achados = pesquisar(campoBusca.value, todos());
      listaResultados.replaceChildren(
        ...achados.map((a) =>
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                class: "resultado",
                "aria-pressed": estado.selecionado === a.id ? "true" : "false",
                onclick: () => selecionar(a.id)
              },
              h("span", { class: "resultado-nome" }, a.nome),
              h(
                "span",
                { class: "resultado-meta" },
                rotuloCategoria(a),
                " · ",
                typeof a.por100.kcal === "number" ? `${numero(a.por100.kcal)} kcal/100 g` : "kcal sem dado"
              )
            )
          )
        )
      );
      if (!campoBusca.value.trim()) contagem.textContent = "";
      else if (!achados.length) contagem.textContent = "Nenhum alimento encontrado. Tente uma palavra só, ou cadastre o alimento abaixo.";
      else contagem.textContent = achados.length === 30 ? "Mostrando os 30 primeiros. Refine a pesquisa." : `${achados.length} encontrado(s).`;
    }
    campoBusca.addEventListener("input", mostrarResultados);

    /* ---------- calculadora ---------- */

    const areaCalculadora = h("section", { class: "cartao", "aria-labelledby": "t-calc", hidden: true });

    function selecionar(id) {
      const a = porId(id);
      if (!a) return;
      if (estado.selecionado !== id) {
        estado.selecionado = id;
        estado.unidade = a.unidadePadrao;
        estado.quantidade = a.unidadePadrao === "g" ? "100" : "1";
      }
      montarCalculadora(a);
      mostrarResultados();
      areaCalculadora.querySelector("#quantidade")?.focus();
    }

    function montarCalculadora(a) {
      const inputQtd = h("input", {
        id: "quantidade",
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        value: estado.quantidade,
        "aria-describedby": "quantidade-erro"
      });
      const seletorUnidade = h(
        "select",
        { id: "unidade", "aria-describedby": "unidade-ajuda" },
        unidadesDe(a).map((u) =>
          h("option", { value: u.chave, selected: u.chave === estado.unidade }, u.chave === "g" ? "g" : `${u.nome} (${numero(u.gramas, u.gramas % 1 ? 1 : 0)} g)`)
        )
      );
      const ajudaUnidade = h("p", { class: "ajuda", id: "unidade-ajuda" });
      const erroQtd = h("p", { class: "erro", id: "quantidade-erro", "aria-live": "polite" });
      const corpoTabela = h("tbody");
      const resumoGramas = h("p", { class: "nota", role: "status" });

      function atualizar() {
        estado.quantidade = inputQtd.value;
        estado.unidade = seletorUnidade.value;
        const unidade = unidadesDe(a).find((u) => u.chave === seletorUnidade.value);
        ajudaUnidade.textContent =
          unidade && unidade.chave !== "g" ? `${unidade.descricao} — ${a.proprio ? "medida sua" : FONTE_MEDIDAS}.` : "";

        const qtd = Number(String(inputQtd.value).replace(",", ".").trim());
        const valido = inputQtd.value.trim() !== "" && Number.isFinite(qtd) && qtd > 0 && qtd <= 100000;
        erroQtd.textContent = valido ? "" : "Informe uma quantidade maior que zero.";
        inputQtd.toggleAttribute("aria-invalid", !valido);
        if (!valido) {
          corpoTabela.replaceChildren();
          resumoGramas.textContent = "";
          return;
        }
        const r = calcular(a, qtd, seletorUnidade.value);
        resumoGramas.textContent = `Equivale a ${numero(r.gramas, r.gramas % 1 ? 1 : 0)} g.`;
        corpoTabela.replaceChildren(
          ...NUTRIENTES.map((n) =>
            h(
              "tr",
              {},
              h("th", { scope: "row" }, n.rotulo),
              h("td", {}, valorNutriente(r.nutrientes[n.chave], n)),
              h("td", { class: "por100" }, valorNutriente(a.por100[n.chave], n))
            )
          )
        );
      }
      inputQtd.addEventListener("input", atualizar);
      seletorUnidade.addEventListener("change", atualizar);

      const semEnergia = a.por100.kcal === null;

      /* replaceChildren nativo escreve "null" como texto; por isso o filtro */
      areaCalculadora.replaceChildren(
        ...[
        h("h2", { id: "t-calc" }, a.nome),
        h("p", { class: "sutil" }, rotuloCategoria(a)),
        h(
          "div",
          { class: "linha-campos" },
          h("div", { class: "campo" }, h("label", { for: "quantidade" }, "Quantidade"), inputQtd, erroQtd),
          h("div", { class: "campo" }, h("label", { for: "unidade" }, "Unidade"), seletorUnidade)
        ),
        ajudaUnidade,
        resumoGramas,
        h(
          "div",
          { class: "tabela-rolagem" },
          h(
            "table",
            {},
            h("caption", { class: "visually-hidden" }, `Nutrientes de ${a.nome} na quantidade escolhida e por 100 g`),
            h(
              "thead",
              {},
              h("tr", {}, h("th", { scope: "col" }, "Nutriente"), h("th", { scope: "col" }, "Nesta quantidade"), h("th", { scope: "col", class: "por100" }, "Por 100 g"))
            ),
            corpoTabela
          )
        ),
        semEnergia
          ? h("p", { class: "alerta", role: "status" }, "A TACO não publica as calorias deste alimento. O app não estima o valor.")
          : null,
        h(
          "p",
          { class: "nota" },
          a.proprio
            ? "Valores informados por você."
            : `Fonte: ${FONTE_ALIMENTOS}, por 100 g de parte comestível. “—” é dado que a tabela não publica; “traço” é quantidade abaixo do que a análise consegue medir.`
        ),
        a.proprio
          ? h(
              "button",
              {
                type: "button",
                class: "botao botao-perigo",
                onclick: () => {
                  if (!window.confirm(`Apagar “${a.nome}” dos seus alimentos?`)) return;
                  storage.set(CHAVE_PROPRIOS, proprios().filter((x) => x.id !== a.id));
                  estado.selecionado = null;
                  areaCalculadora.hidden = true;
                  mostrarResultados();
                  campoBusca.focus();
                }
              },
              "Apagar este alimento"
            )
          : null
        ].filter(Boolean)
      );
      areaCalculadora.hidden = false;
      atualizar();
    }

    /* ---------- cadastrar alimento próprio ---------- */

    function campoNum(id, rotulo, ajuda) {
      return h(
        "div",
        { class: "campo" },
        h("label", { for: id }, rotulo),
        h("input", { id, name: id, type: "text", inputmode: "decimal", autocomplete: "off", "aria-describedby": `${id}-erro${ajuda ? ` ${id}-ajuda` : ""}` }),
        ajuda ? h("p", { class: "ajuda", id: `${id}-ajuda` }, ajuda) : null,
        h("p", { class: "erro", id: `${id}-erro`, "aria-live": "polite" })
      );
    }

    const formulario = h(
      "form",
      { class: "formulario", novalidate: true },
      h(
        "div",
        { class: "campo" },
        h("label", { for: "nome-alimento" }, "Nome"),
        h("input", { id: "nome-alimento", name: "nome", type: "text", autocomplete: "off", "aria-describedby": "nome-erro" }),
        h("p", { class: "erro", id: "nome-erro", "aria-live": "polite" })
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { for: "categoria" }, "Categoria"),
        h("select", { id: "categoria", name: "categoria" }, Object.entries(CATEGORIAS).map(([k, v]) => h("option", { value: k }, v))),
        h("p", { class: "erro", id: "categoria-erro", "aria-live": "polite" })
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { for: "tipoProteina" }, "Tipo de proteína"),
        h(
          "select",
          { id: "tipoProteina", name: "tipoProteina" },
          h("option", { value: "" }, "Não informar"),
          Object.entries(TIPOS_PROTEINA).map(([k, v]) => h("option", { value: k }, v))
        )
      ),
      h(
        "fieldset",
        {},
        h("legend", {}, "Por 100 g (do rótulo)"),
        campoNum("kcal", "Calorias (kcal)"),
        campoNum("proteina", "Proteína (g)"),
        campoNum("carboidrato", "Carboidratos (g)"),
        campoNum("gordura", "Gordura total (g)"),
        campoNum("fibra", "Fibra (g)", "Deixe em branco se o rótulo não traz."),
        campoNum("sodio", "Sódio (mg)", "Deixe em branco se o rótulo não traz.")
      ),
      h(
        "fieldset",
        {},
        h("legend", {}, "Medida caseira (opcional)"),
        h(
          "div",
          { class: "campo" },
          h("label", { for: "nomeUnidade" }, "Nome da medida"),
          h("input", { id: "nomeUnidade", name: "nomeUnidade", type: "text", autocomplete: "off", placeholder: "ex.: dose, scoop, unidade" })
        ),
        campoNum("gramasPorUnidade", "Gramas por medida", "Ex.: uma dose de 30 g.")
      ),
      h("p", { class: "erro-geral", role: "alert" }),
      h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Salvar alimento"))
    );

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const d = new FormData(formulario);
      const num = (k) => {
        const t = String(d.get(k) ?? "").replace(",", ".").trim();
        return t === "" ? null : Number(t);
      };
      const dados = {
        nome: String(d.get("nome") ?? ""),
        categoria: String(d.get("categoria")),
        tipoProteina: String(d.get("tipoProteina") ?? ""),
        nomeUnidade: String(d.get("nomeUnidade") ?? ""),
        gramasPorUnidade: num("gramasPorUnidade"),
        por100: {
          kcal: num("kcal"),
          proteina: num("proteina"),
          carboidrato: num("carboidrato"),
          gordura: num("gordura"),
          fibra: num("fibra"),
          sodio: num("sodio")
        }
      };
      const erros = validarAlimento(dados);
      /* proteína, carboidrato e gordura são obrigatórios: sem eles o alimento não entra na conta de macros */
      for (const k of ["proteina", "carboidrato", "gordura"]) {
        if (dados.por100[k] === null) erros[k] = "Informe o valor (0 se o rótulo diz zero).";
      }

      const ids = { nome: "nome-alimento" };
      formulario.querySelectorAll(".erro").forEach((p) => (p.textContent = ""));
      formulario.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
      const chaves = Object.keys(erros);
      for (const k of chaves) {
        const input = formulario.querySelector(`#${ids[k] ?? k}`);
        input?.setAttribute("aria-invalid", "true");
        const msg = formulario.querySelector(`#${k}-erro`);
        if (msg) msg.textContent = erros[k];
      }
      const geral = formulario.querySelector(".erro-geral");
      if (chaves.length) {
        geral.textContent = `Revise ${chaves.length === 1 ? "1 campo" : `${chaves.length} campos`}.`;
        formulario.querySelector(`#${ids[chaves[0]] ?? chaves[0]}`)?.focus();
        return;
      }
      geral.textContent = "";
      const novo = montarAlimentoProprio(dados, `proprio-${Date.now().toString(36)}`);
      if (!storage.set(CHAVE_PROPRIOS, [novo, ...proprios()])) {
        geral.textContent = "Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio).";
        return;
      }
      formulario.reset();
      campoBusca.value = novo.nome;
      selecionar(novo.id);
    });

    const tela = h(
      "div",
      { class: "pilha" },
      h(
        "header",
        { class: "cabecalho-tela" },
        h("h1", { id: "titulo-tela" }, "Alimentos"),
        h("p", { class: "sutil" }, `${numero(total)} alimentos da TACO, mais os que você cadastrar.`)
      ),
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-busca" },
        h("h2", { id: "t-busca" }, h("label", { for: "busca-alimento" }, "Pesquisar alimento")),
        campoBusca,
        h("p", { class: "ajuda", id: "busca-ajuda" }, "Sem acento também funciona. Os nomes seguem a TACO: “Frango, peito, sem pele, cozido”."),
        contagem,
        listaResultados
      ),
      areaCalculadora,
      h(
        "details",
        { class: "cartao" },
        h("summary", {}, "Cadastrar um alimento que não está na lista"),
        h("p", { class: "nota" }, "Use os valores do rótulo, por 100 g. Fica salvo só neste navegador."),
        formulario
      ),
      avisoSaude()
    );

    if (estado.consulta) mostrarResultados();
    const anterior = estado.selecionado && porId(estado.selecionado);
    if (anterior) montarCalculadora(anterior);
    return tela;
  };
}
