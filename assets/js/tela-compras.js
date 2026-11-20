/*
 * Tela "Compras" (fase 6): lista manual e gerada a partir da dieta, agrupada, com status.
 * Lógica em shopping.js; aqui só DOM.
 */

import {
  GRUPOS,
  STATUS,
  normalizarLista,
  adicionarManual,
  mudarStatus,
  removerItem,
  limparConcluidos,
  gerarDaDieta,
  agrupar,
  textoQuantidade,
  textoParaCopiar
} from "./shopping.js";
import { criarCatalogo } from "./catalogo.js";
import { lerDieta } from "./tela-dieta.js";

const CHAVE = "compras";

export function criarTelaCompras({ h, storage }) {
  const catalogo = criarCatalogo(storage);

  return function telaCompras() {
    const raiz = h("div", { class: "pilha" });
    let lista = normalizarLista(storage.get(CHAVE));

    function salvar(nova, foco, mensagem = "") {
      lista = nova;
      storage.set(CHAVE, nova);
      desenhar(foco, mensagem);
    }

    function cartaoGerar() {
      const dieta = lerDieta(storage);
      const temDieta = dieta.refeicoes.some((r) => r.itens.length);
      const dias = h("input", { id: "cp-dias", type: "text", inputmode: "numeric", autocomplete: "off", value: String(lista.diasGerados), "aria-describedby": "cp-dias-erro cp-dias-ajuda" });
      const erro = h("p", { class: "erro", id: "cp-dias-erro", "aria-live": "polite" });
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-gerar" },
        h("h2", { id: "t-gerar" }, "Gerar da dieta"),
        temDieta
          ? h(
              "form",
              {
                class: "formulario",
                novalidate: true,
                onsubmit: (e) => {
                  e.preventDefault();
                  const n = Number(dias.value.trim());
                  if (!(Number.isInteger(n) && n >= 1 && n <= 31)) {
                    erro.textContent = "Número inteiro de dias, de 1 a 31.";
                    dias.setAttribute("aria-invalid", "true");
                    dias.focus();
                    return;
                  }
                  const nova = gerarDaDieta(lista, dieta, catalogo.buscar, n);
                  const qtd = nova.itens.filter((i) => i.origem === "dieta").length;
                  salvar(nova, "t-lista", `Lista gerada para ${n} dia(s): ${qtd} alimento(s) da dieta. Os itens que você adicionou continuam.`);
                }
              },
              h(
                "div",
                { class: "campo" },
                h("label", { for: "cp-dias" }, "Para quantos dias?"),
                dias,
                h("p", { class: "ajuda", id: "cp-dias-ajuda" }, "Soma os alimentos de todas as refeições da dieta. O peso é o do alimento como está na dieta (ex.: arroz cozido), não o do pacote."),
                erro
              ),
              h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Gerar lista"))
            )
          : h("p", {}, "A dieta ainda está vazia. ", h("a", { href: "#dieta" }, "Montar a dieta"), " para gerar a lista, ou adicione itens à mão abaixo.")
      );
    }

    function linhaItem(item) {
      const seletor = h(
        "select",
        { id: `st-${item.id}`, "aria-label": `Situação de ${item.nome}` },
        Object.entries(STATUS).map(([k, r]) => h("option", { value: k, selected: k === item.status }, r))
      );
      seletor.addEventListener("change", () => salvar(mudarStatus(lista, item.id, seletor.value), `st-${item.id}`));
      return h(
        "li",
        { class: `compra status-${item.status}` },
        h(
          "span",
          { class: "compra-nome" },
          item.status === "comprado" ? h("span", { "aria-hidden": "true" }, "✓ ") : null,
          item.nome,
          item.gramas ? h("span", { class: "compra-qtd" }, ` ${textoQuantidade(item.gramas)}`) : null,
          item.origem === "manual" ? h("span", { class: "compra-qtd" }, " · adicionado por você") : null
        ),
        h(
          "span",
          { class: "compra-controles" },
          seletor,
          h(
            "button",
            {
              type: "button",
              class: "botao-icone",
              "aria-label": `Tirar ${item.nome} da lista`,
              onclick: () => salvar(removerItem(lista, item.id), "t-lista", `${item.nome} saiu da lista.`)
            },
            "✕"
          )
        )
      );
    }

    function cartaoLista() {
      const grupos = agrupar(lista.itens);
      const pendentes = lista.itens.filter((i) => i.status === "comprar").length;
      const copiar = async () => {
        const texto = textoParaCopiar(lista);
        const status = raiz.querySelector("#compras-aviso");
        if (!texto) {
          status.textContent = "Nada para comprar na lista.";
          return;
        }
        try {
          await navigator.clipboard.writeText(texto);
          status.textContent = "Lista copiada. Cole no aplicativo de mensagens ou de notas.";
        } catch {
          status.textContent = "Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.";
          const area = raiz.querySelector("#cp-texto");
          area.hidden = false;
          area.value = texto;
          area.select();
        }
      };
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-lista" },
        h("h2", { id: "t-lista", tabindex: "-1" }, "Lista"),
        lista.itens.length
          ? h("p", { class: "nota" }, `${pendentes} para comprar de ${lista.itens.length} item(ns).`)
          : h("p", {}, "Lista vazia."),
        ...grupos.map(([g, itens]) =>
          h("div", { class: "grupo-compras" }, h("h3", {}, GRUPOS[g]), h("ul", { class: "compras" }, itens.map(linhaItem)))
        ),
        lista.itens.length
          ? h(
              "div",
              { class: "acoes" },
              h("button", { type: "button", class: "botao", onclick: copiar }, "Copiar o que falta comprar"),
              h(
                "button",
                {
                  type: "button",
                  class: "botao",
                  onclick: () => salvar(limparConcluidos(lista), "t-lista", "Comprados e ignorados saíram da lista.")
                },
                "Tirar comprados e ignorados"
              )
            )
          : null,
        h("textarea", { id: "cp-texto", rows: "8", readonly: true, hidden: true, "aria-label": "Lista em texto para copiar" })
      );
    }

    function cartaoManual() {
      const nome = h("input", { id: "cp-nome", type: "text", autocomplete: "off", maxlength: "80", placeholder: "ex.: creatina, canela", "aria-describedby": "cp-nome-erro" });
      const grupo = h("select", { id: "cp-grupo" }, Object.entries(GRUPOS).map(([k, r]) => h("option", { value: k }, r)));
      const erro = h("p", { class: "erro", id: "cp-nome-erro", "aria-live": "polite" });
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-manual" },
        h("h2", { id: "t-manual" }, "Adicionar item"),
        h(
          "form",
          {
            class: "formulario",
            novalidate: true,
            onsubmit: (e) => {
              e.preventDefault();
              try {
                salvar(adicionarManual(lista, { id: `m-${Date.now().toString(36)}`, nome: nome.value, grupo: grupo.value }), "cp-nome", `${nome.value.trim()} entrou na lista.`);
              } catch (falha) {
                erro.textContent = falha.message;
                nome.setAttribute("aria-invalid", "true");
                nome.focus();
              }
            }
          },
          h(
            "div",
            { class: "linha-campos" },
            h("div", { class: "campo" }, h("label", { for: "cp-nome" }, "Item"), nome, erro),
            h("div", { class: "campo" }, h("label", { for: "cp-grupo" }, "Grupo"), grupo)
          ),
          h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Adicionar"))
        )
      );
    }

    function desenhar(focoId, mensagem = "") {
      raiz.replaceChildren(
        h(
          "header",
          { class: "cabecalho-tela" },
          h("h1", { id: "titulo-tela", tabindex: "-1" }, "Compras"),
          h("p", { class: "sutil" }, "Lista gerada da dieta, mais o que você adicionar.")
        ),
        h("p", { class: "nota", id: "compras-aviso", role: "status" }, mensagem),
        cartaoGerar(),
        cartaoLista(),
        cartaoManual()
      );
      if (focoId) {
        const alvo = raiz.querySelector(`#${CSS.escape(focoId)}`);
        if (alvo) queueMicrotask(() => alvo.focus());
      }
    }

    desenhar();
    return raiz;
  };
}
