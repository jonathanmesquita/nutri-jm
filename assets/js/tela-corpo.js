/*
 * Tela "Corpo" (fase 5): medições de bioimpedância e peso, histórico e avatar.
 * Lógica em body.js; aqui só DOM. São registros de medição, não diagnóstico.
 */

import {
  CAMPOS_MEDICAO,
  validarMedicao,
  ordenar,
  ultimaMedicao,
  salvarMedicao,
  removerMedicao,
  imcDaMedicao,
  variacao,
  estagioAvatar,
  desenhoAvatar,
  medicoesDeExemplo
} from "./body.js";
import { PERFIL_DEMONSTRACAO } from "../../data/default-data.js";

const CHAVE_MEDICOES = "medicoes";
const CHAVE_PREFERENCIAS = "preferencias";
const SVG = "http://www.w3.org/2000/svg";

/* Cores do avatar: tokens da paleta, lidos do CSS, para o desenho acompanhar o tema. */
const CORES_AVATAR = { pele: "--avatar-pele", cabelo: "--tinta", tinta: "--tinta", camisa: "--oliva", calca: "--terracota-texto" };

export function lerMedicoes(storage) {
  const lista = storage.get(CHAVE_MEDICOES, []);
  return Array.isArray(lista) ? lista : [];
}

export function dataBr(iso) {
  const [a, m, d] = String(iso).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "—";
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function criarTelaCorpo({ h, storage, avisoSaude, lerPerfil, salvarPerfil }) {
  const fmt = (v, casas = 1) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
  const sem = () => h("span", {}, h("span", { "aria-hidden": "true" }, "—"), h("span", { class: "visually-hidden" }, "não medido"));
  const valor = (v, sufixo, casas = 1) => (v === null || v === undefined ? sem() : `${fmt(v, casas)}${sufixo}`);
  const sinal = (v, casas = 1) => (v > 0 ? `+${fmt(v, casas)}` : fmt(v, casas));

  function avatarSvg(estagio) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 32");
    svg.setAttribute("class", "avatar");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Avatar em pixel art, estágio ${estagio.numero} de ${estagio.total}`);
    svg.setAttribute("shape-rendering", "crispEdges");
    const estilo = getComputedStyle(document.body);
    for (const p of desenhoAvatar(estagio)) {
      const r = document.createElementNS(SVG, "rect");
      for (const k of ["x", "y", "width", "height"]) r.setAttribute(k, String(p[k === "width" ? "w" : k === "height" ? "h" : k]));
      r.setAttribute("fill", estilo.getPropertyValue(CORES_AVATAR[p.cor]).trim() || "#1b1d1a");
      svg.append(r);
    }
    return svg;
  }

  return function telaCorpo() {
    const raiz = h("div", { class: "pilha" });
    let medicoes = lerMedicoes(storage);
    let editando = null; // id da medição em edição

    function salvarLista(lista, foco, mensagem) {
      medicoes = lista;
      storage.set(CHAVE_MEDICOES, lista);
      desenhar(foco, mensagem);
    }

    /* ---------- última medição e avatar ---------- */

    function cartaoUltima(perfil) {
      const m = ultimaMedicao(medicoes);
      if (!m) return null;
      const indice = imcDaMedicao(m, perfil?.altura);
      const v = variacao(medicoes, m.id);
      const linha = (rotulo, conteudo, extra) =>
        h("div", { class: "linha" }, h("dt", {}, rotulo), h("dd", {}, conteudo, extra ? h("span", { class: "extra" }, extra) : null));
      const dif = (campo, sufixo) => (v && v.dif[campo] !== null ? `${sinal(v.dif[campo])}${sufixo} desde ${dataBr(v.anteriorEm)}` : null);
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-ultima" },
        h("h2", { id: "t-ultima" }, `Última medição — ${dataBr(m.data)}`),
        h(
          "dl",
          { class: "lista" },
          linha("Peso", `${fmt(m.peso)} kg`, dif("peso", " kg")),
          linha(
            "IMC",
            indice ? fmt(indice.valor, 2) : sem(),
            indice ? `${indice.classe}${indice.alturaDoPerfil ? " · altura do perfil" : ""}` : "sem altura"
          ),
          linha("Gordura corporal", valor(m.gorduraPct, "%"), dif("gorduraPct", " p.p.")),
          linha("Músculo esquelético", valor(m.musculoPct, "%"), dif("musculoPct", " p.p.")),
          linha("Gordura visceral", valor(m.gorduraVisceral, "", 0)),
          linha("TMB medida", valor(m.tmbMedida, " kcal", 0)),
          linha("Idade corporal", valor(m.idadeCorporal, " anos", 0))
        ),
        m.observacao ? h("p", { class: "nota" }, `Observação: ${m.observacao}`) : null,
        h(
          "p",
          { class: "nota" },
          "O IMC não diferencia massa muscular de gordura corporal e deve ser interpretado apenas como indicador geral. Gordura e músculo aparecem separados porque são outra medida."
        ),
        cartaoAvatar(indice)
      );
    }

    function cartaoAvatar(indice) {
      const prefs = storage.get(CHAVE_PREFERENCIAS, {});
      const mostrar = prefs.avatar !== false;
      const alternar = h(
        "button",
        {
          type: "button",
          class: "botao",
          id: "alternar-avatar",
          "aria-pressed": mostrar ? "true" : "false",
          onclick: () => {
            storage.set(CHAVE_PREFERENCIAS, { ...prefs, avatar: !mostrar });
            desenhar("alternar-avatar");
          }
        },
        mostrar ? "Esconder avatar" : "Mostrar avatar"
      );
      if (!mostrar) return h("div", { class: "avatar-bloco" }, alternar);
      const estagio = indice ? estagioAvatar(indice.valor) : null;
      if (!estagio) return h("div", { class: "avatar-bloco" }, h("p", { class: "nota" }, "O avatar aparece quando houver altura para calcular o IMC."), alternar);
      const faixa = estagio.max === Infinity ? `IMC a partir de ${fmt(estagio.min)}` : `IMC de ${fmt(estagio.min)} a ${fmt(estagio.max)}`;
      return h(
        "div",
        { class: "avatar-bloco" },
        h("figure", { class: "avatar-figura" }, avatarSvg(estagio), h("figcaption", {}, `Estágio ${estagio.numero} de ${estagio.total} · ${faixa}`)),
        h("p", { class: "nota" }, "Representação lúdica do IMC. Não mostra gordura nem músculo, e não diz nada sobre a pessoa além desse número."),
        alternar
      );
    }

    /* ---------- formulário ---------- */

    function formulario(perfil) {
      const atual = editando ? medicoes.find((m) => m.id === editando) : null;
      const ultima = ultimaMedicao(medicoes);
      const campoNum = (id, [rotulo]) =>
        h(
          "div",
          { class: "campo" },
          h("label", { for: `m-${id}` }, rotulo),
          h("input", {
            id: `m-${id}`,
            name: id,
            type: "text",
            inputmode: "decimal",
            autocomplete: "off",
            value: atual && atual[id] != null ? String(atual[id]).replace(".", ",") : id === "altura" && !atual && perfil?.altura ? String(perfil.altura) : "",
            "aria-describedby": `m-${id}-erro`
          }),
          h("p", { class: "erro", id: `m-${id}-erro`, "aria-live": "polite" })
        );

      const atualizarPerfil = h("input", { id: "m-perfil", type: "checkbox", checked: !atual || (ultima && atual.id === ultima.id) });
      const form = h(
        "form",
        { class: "formulario", novalidate: true },
        h(
          "div",
          { class: "linha-campos" },
          h(
            "div",
            { class: "campo" },
            h("label", { for: "m-data" }, "Data"),
            h("input", { id: "m-data", name: "data", type: "date", max: hojeIso(), value: atual?.data ?? hojeIso(), "aria-describedby": "m-data-erro" }),
            h("p", { class: "erro", id: "m-data-erro", "aria-live": "polite" })
          ),
          campoNum("peso", CAMPOS_MEDICAO.peso)
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "Bioimpedância (opcional)"),
          h("p", { class: "ajuda" }, "Preencha só o que o aparelho mediu. O que ficar em branco aparece como “—”."),
          ...["altura", "gorduraPct", "musculoPct", "gorduraVisceral", "tmbMedida", "idadeCorporal"].map((c) => campoNum(c, CAMPOS_MEDICAO[c]))
        ),
        h(
          "div",
          { class: "campo" },
          h("label", { for: "m-observacao" }, "Observação (opcional)"),
          h("textarea", { id: "m-observacao", name: "observacao", rows: "2", maxlength: "280", "aria-describedby": "m-observacao-erro" }, atual?.observacao ?? ""),
          h("p", { class: "erro", id: "m-observacao-erro", "aria-live": "polite" })
        ),
        perfil
          ? h(
              "label",
              { class: "opcao-check" },
              atualizarPerfil,
              " Atualizar meu perfil com o peso, a altura e a TMB desta medição"
            )
          : null,
        h("p", { class: "erro-geral", role: "alert" }),
        h(
          "div",
          { class: "acoes" },
          h("button", { type: "submit", class: "botao botao-principal" }, atual ? "Salvar alterações" : "Salvar medição"),
          atual
            ? h("button", { type: "button", class: "botao", onclick: () => { editando = null; desenhar("t-form"); } }, "Cancelar")
            : null
        )
      );

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const num = (k) => {
          const t = String(d.get(k) ?? "").replace(",", ".").trim();
          return t === "" ? null : Number(t);
        };
        const medicao = {
          id: atual?.id ?? `med-${Date.now().toString(36)}`,
          data: String(d.get("data") ?? ""),
          observacao: String(d.get("observacao") ?? "").trim()
        };
        for (const c of Object.keys(CAMPOS_MEDICAO)) medicao[c] = num(c);

        const erros = validarMedicao(medicao);
        form.querySelectorAll(".erro").forEach((p) => (p.textContent = ""));
        form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
        const chaves = Object.keys(erros);
        for (const k of chaves) {
          form.querySelector(`#m-${k}`)?.setAttribute("aria-invalid", "true");
          const msg = form.querySelector(`#m-${k}-erro`);
          if (msg) msg.textContent = erros[k];
        }
        const geral = form.querySelector(".erro-geral");
        if (chaves.length) {
          geral.textContent = `Revise ${chaves.length === 1 ? "1 campo" : `${chaves.length} campos`}.`;
          form.querySelector(`#m-${chaves[0]}`)?.focus();
          return;
        }

        if (perfil && atualizarPerfil.checked) {
          salvarPerfil({
            ...perfil,
            peso: medicao.peso,
            altura: medicao.altura ?? perfil.altura,
            tmbMedida: medicao.tmbMedida ?? perfil.tmbMedida
          });
        }
        editando = null;
        salvarLista(
          salvarMedicao(medicoes, medicao),
          "t-ultima",
          perfil && atualizarPerfil.checked ? "Medição salva e perfil atualizado." : "Medição salva."
        );
      });

      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-form" },
        h("h2", { id: "t-form", tabindex: "-1" }, atual ? `Editar medição de ${dataBr(atual.data)}` : "Nova medição"),
        form
      );
    }

    /* ---------- histórico ---------- */

    function historico(perfil) {
      if (!medicoes.length) return null;
      const lista = ordenar(medicoes);
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-historico" },
        h("h2", { id: "t-historico" }, "Histórico"),
        h(
          "div",
          { class: "tabela-rolagem", tabindex: "0", role: "region", "aria-label": "Tabela do histórico de medições" },
          h(
            "table",
            { class: "tabela-historico" },
            h("caption", { class: "visually-hidden" }, "Medições, da mais recente para a mais antiga"),
            h(
              "thead",
              {},
              h("tr", {}, ["Data", "Peso", "Gordura", "Músculo", "IMC", "Visceral", "TMB", "Idade corp.", "Ações"].map((c) => h("th", { scope: "col" }, c)))
            ),
            h(
              "tbody",
              {},
              lista.map((m) => {
                const i = imcDaMedicao(m, perfil?.altura);
                return h(
                  "tr",
                  {},
                  h("th", { scope: "row" }, dataBr(m.data)),
                  h("td", {}, `${fmt(m.peso)} kg`),
                  h("td", {}, valor(m.gorduraPct, "%")),
                  h("td", {}, valor(m.musculoPct, "%")),
                  h("td", {}, i ? fmt(i.valor, 2) : sem()),
                  h("td", {}, valor(m.gorduraVisceral, "", 0)),
                  h("td", {}, valor(m.tmbMedida, " kcal", 0)),
                  h("td", {}, valor(m.idadeCorporal, "", 0)),
                  h(
                    "td",
                    { class: "acoes-tabela" },
                    h("button", { type: "button", class: "botao-icone", "aria-label": `Editar medição de ${dataBr(m.data)}`, onclick: () => { editando = m.id; desenhar("t-form"); } }, "✎"),
                    h(
                      "button",
                      {
                        type: "button",
                        class: "botao-icone",
                        "aria-label": `Remover medição de ${dataBr(m.data)}`,
                        onclick: () => {
                          if (!window.confirm(`Remover a medição de ${dataBr(m.data)}?`)) return;
                          if (editando === m.id) editando = null;
                          salvarLista(removerMedicao(medicoes, m.id), "t-historico", "Medição removida.");
                        }
                      },
                      "✕"
                    )
                  )
                );
              })
            )
          )
        )
      );
    }

    /* ---------- tela ---------- */

    function desenhar(focoId, mensagem = "") {
      const perfil = lerPerfil();
      const vazia = !medicoes.length;
      raiz.replaceChildren(
        ...[
          h(
            "header",
            { class: "cabecalho-tela" },
            h("h1", { id: "titulo-tela", tabindex: "-1" }, "Corpo"),
            h("p", { class: "sutil" }, "Registros de medição, não diagnóstico.")
          ),
          h("p", { class: "nota", id: "corpo-aviso", role: "status" }, mensagem),
          vazia
            ? h(
                "section",
                { class: "cartao" },
                h("p", {}, "Nenhuma medição ainda. Registre o peso de hoje ou os dados de uma bioimpedância abaixo."),
                perfil && perfil.nome === PERFIL_DEMONSTRACAO.nome
                  ? h(
                      "button",
                      { type: "button", class: "botao", onclick: () => salvarLista(medicoesDeExemplo(), "t-ultima", "Medições de exemplo carregadas. São fictícias.") },
                      "Preencher com medições de exemplo"
                    )
                  : null
              )
            : null,
          cartaoUltima(perfil),
          formulario(perfil),
          historico(perfil),
          avisoSaude()
        ].filter(Boolean)
      );
      if (focoId) {
        const alvo = raiz.querySelector(`#${CSS.escape(focoId)}`);
        if (alvo) {
          if (!alvo.hasAttribute("tabindex") && /^H\d$/.test(alvo.tagName)) alvo.setAttribute("tabindex", "-1");
          queueMicrotask(() => alvo.focus());
        }
      }
    }

    desenhar();
    return raiz;
  };
}
