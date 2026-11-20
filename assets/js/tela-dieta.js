/*
 * Tela "Dieta" (fase 4): refeições, alimentos por refeição, subtotais e resumo do dia.
 * Lógica em diet.js; aqui só DOM. Toda mudança salva e redesenha a tela, devolvendo o
 * foco ao controle equivalente, para quem usa teclado ou leitor de tela não se perder.
 */

import { CATEGORIAS, pesquisar, unidadesDe, converterQuantidade } from "./foods.js";
import { criarCatalogo } from "./catalogo.js";
import {
  normalizarDieta,
  adicionarRefeicao,
  removerRefeicao,
  editarRefeicao,
  moverRefeicao,
  adicionarItem,
  editarItem,
  removerItem,
  totaisItem,
  totaisRefeicao,
  totaisDia,
  resumoDiario,
  diaDeExemplo,
  validarHorario,
  ROTULO_ESTADO
} from "./diet.js";

const CHAVE_DIETA = "dieta";

export function lerDieta(storage) {
  return normalizarDieta(storage.get(CHAVE_DIETA));
}

/* Metas do perfil no formato do resumo diário (ou null sem perfil). */
export function metasDoPerfil(perfil, resumo) {
  if (!perfil) return null;
  const r = resumo(perfil);
  return { kcal: r.meta, proteina: r.macros.proteina, carboidrato: r.macros.carboidrato, gordura: r.macros.gordura };
}

export function criarTelaDieta({ h, numero, storage, avisoSaude, lerPerfil, resumo }) {
  const catalogo = criarCatalogo(storage);
  const fmt = (v, casas = 0) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
  const sinal = (v, casas = 0) => (v > 0 ? `+${fmt(v, casas)}` : fmt(v, casas));
  const numeroDigitado = (texto) => {
    const t = String(texto ?? "").replace(",", ".").trim();
    return t === "" ? Number.NaN : Number(t);
  };

  return function telaDieta() {
    const raiz = h("div", { class: "pilha" });
    let dieta = lerDieta(storage);
    /* refeição com a busca de alimento aberta, e o texto dela, entre um redesenho e outro */
    const buscaAberta = { refeicao: null, texto: "" };

    function salvar(nova, focoId) {
      dieta = nova;
      storage.set(CHAVE_DIETA, nova);
      desenhar(focoId);
    }

    function aviso(mensagem) {
      const p = raiz.querySelector("#dieta-aviso");
      if (p) p.textContent = mensagem;
    }

    /* ---------- um item ---------- */

    function linhaItem(refeicao, item) {
      const alimento = catalogo.buscar(item.alimentoId);
      const t = totaisItem(item, catalogo.buscar);
      const idQtd = `q-${item.id}`;
      if (!alimento) {
        return h(
          "li",
          { class: "item" },
          h("span", { class: "item-nome" }, "Alimento removido do cadastro"),
          h("button", { type: "button", class: "botao-icone", "aria-label": "Remover item sem alimento", onclick: () => salvar(removerItem(dieta, refeicao.id, item.id), `add-${refeicao.id}`) }, "✕")
        );
      }
      const inputQtd = h("input", {
        id: idQtd,
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        value: String(item.quantidade).replace(".", ","),
        "aria-label": `Quantidade de ${alimento.nome}`
      });
      const seletor = h(
        "select",
        { id: `u-${item.id}`, "aria-label": `Unidade de ${alimento.nome}` },
        unidadesDe(alimento).map((u) =>
          h("option", { value: u.chave, selected: u.chave === item.unidade }, u.chave === "g" ? "g" : `${u.nome} (${fmt(u.gramas, 1)} g)`)
        )
      );
      const aplicar = (focoId) => {
        const q = numeroDigitado(inputQtd.value);
        if (!(q > 0 && q <= 100000)) {
          inputQtd.setAttribute("aria-invalid", "true");
          aviso(`Quantidade inválida em ${alimento.nome}: use um número maior que zero.`);
          return;
        }
        salvar(editarItem(dieta, refeicao.id, item.id, { quantidade: q, unidade: seletor.value }), focoId);
      };
      inputQtd.addEventListener("change", () => aplicar(idQtd));
      seletor.addEventListener("change", () => {
        /* mesma quantidade em peso na unidade nova */
        const convertida = converterQuantidade(alimento, item.quantidade, item.unidade, seletor.value);
        if (convertida) inputQtd.value = String(convertida).replace(".", ",");
        aplicar(`u-${item.id}`);
      });

      return h(
        "li",
        { class: "item" },
        h("span", { class: "item-nome" }, alimento.nome),
        h("span", { class: "item-controles" }, inputQtd, seletor),
        h(
          "span",
          { class: "item-valores" },
          t.incompleto.kcal ? "kcal sem dado" : `${fmt(t.kcal)} kcal`,
          " · ",
          `${fmt(t.proteina, 1)} g prot.`
        ),
        h(
          "button",
          {
            type: "button",
            class: "botao-icone",
            "aria-label": `Remover ${alimento.nome}`,
            onclick: () => salvar(removerItem(dieta, refeicao.id, item.id), `add-${refeicao.id}`)
          },
          "✕"
        )
      );
    }

    /* ---------- adicionar alimento a uma refeição ---------- */

    function blocoAdicionar(refeicao) {
      const aberto = buscaAberta.refeicao === refeicao.id;
      const botao = h(
        "button",
        {
          type: "button",
          class: "botao",
          id: `add-${refeicao.id}`,
          "aria-expanded": aberto ? "true" : "false",
          onclick: () => {
            buscaAberta.refeicao = aberto ? null : refeicao.id;
            buscaAberta.texto = "";
            desenhar(aberto ? `add-${refeicao.id}` : `busca-${refeicao.id}`);
          }
        },
        aberto ? "Fechar pesquisa" : "+ Adicionar alimento"
      );
      if (!aberto) return h("div", { class: "acoes" }, botao);

      const campo = h("input", {
        id: `busca-${refeicao.id}`,
        type: "search",
        autocomplete: "off",
        value: buscaAberta.texto,
        placeholder: "ex.: arroz, frango, banana",
        "aria-label": `Pesquisar alimento para ${refeicao.nome}`
      });
      const lista = h("ul", { class: "resultados" });
      const status = h("p", { class: "nota", role: "status" });
      const mostrar = () => {
        buscaAberta.texto = campo.value;
        const achados = pesquisar(campo.value, catalogo.todos(), 8);
        status.textContent = campo.value.trim() && !achados.length ? "Nenhum alimento encontrado." : "";
        lista.replaceChildren(
          ...achados.map((a) =>
            h(
              "li",
              {},
              h(
                "button",
                {
                  type: "button",
                  class: "resultado",
                  onclick: () => {
                    const unidade = a.unidadePadrao;
                    const quantidade = unidade === "g" ? 100 : 1;
                    const nova = adicionarItem(dieta, refeicao.id, { alimentoId: a.id, quantidade, unidade });
                    const item = nova.refeicoes.find((r) => r.id === refeicao.id).itens.at(-1);
                    buscaAberta.refeicao = null;
                    salvar(nova, `q-${item.id}`);
                    aviso(`${a.nome} adicionado a ${refeicao.nome}. Ajuste a quantidade.`);
                  }
                },
                h("span", { class: "resultado-nome" }, a.nome),
                h(
                  "span",
                  { class: "resultado-meta" },
                  CATEGORIAS[a.categoria] ?? "Outros",
                  " · ",
                  typeof a.por100.kcal === "number" ? `${fmt(a.por100.kcal)} kcal/100 g` : "kcal sem dado"
                )
              )
            )
          )
        );
      };
      campo.addEventListener("input", mostrar);
      campo.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          buscaAberta.refeicao = null;
          desenhar(`add-${refeicao.id}`);
        }
      });
      if (buscaAberta.texto) queueMicrotask(mostrar);
      return h("div", { class: "busca-refeicao" }, h("div", { class: "acoes" }, botao), campo, status, lista);
    }

    /* ---------- subtotal ---------- */

    function subtotal(t, rotulo) {
      const linhas = [
        ["Proteína animal", `${fmt(t.proteinaAnimal, 1)} g`],
        ["Proteína vegetal", `${fmt(t.proteinaVegetal, 1)} g`],
        t.proteinaSemTipo > 0.05 ? ["Proteína sem tipo", `${fmt(t.proteinaSemTipo, 1)} g`] : null,
        ["Proteína total", `${fmt(t.proteina, 1)} g`],
        ["Carboidratos", `${fmt(t.carboidrato, 1)} g`],
        ["Gordura", `${fmt(t.gordura, 1)} g`],
        ["Calorias", `${fmt(t.kcal)} kcal`]
      ].filter(Boolean);
      return h(
        "dl",
        { class: "subtotal", "aria-label": rotulo },
        linhas.map(([k, v]) => h("div", { class: "linha" }, h("dt", {}, k), h("dd", {}, v)))
      );
    }

    function avisoIncompleto(t) {
      const nomes = [...new Set(Object.values(t.incompleto).flat())];
      if (!nomes.length) return null;
      return h("p", { class: "alerta" }, `Total parcial: ${nomes.join(", ")} não tem todos os valores publicados na fonte, e o que falta não foi somado.`);
    }

    /* ---------- uma refeição ---------- */

    function cartaoRefeicao(refeicao, indice) {
      const t = totaisRefeicao(refeicao, catalogo.buscar);
      const idTitulo = `t-${refeicao.id}`;
      const primeira = indice === 0;
      const ultima = indice === dieta.refeicoes.length - 1;

      const nome = h("input", { id: `nome-${refeicao.id}`, type: "text", value: refeicao.nome, autocomplete: "off", maxlength: "60" });
      const horario = h("input", { id: `hora-${refeicao.id}`, type: "time", value: refeicao.horario });
      const erro = h("p", { class: "erro", "aria-live": "polite" });

      const edicao = h(
        "details",
        { class: "editar-refeicao" },
        h("summary", {}, "Editar refeição"),
        h(
          "form",
          {
            class: "formulario",
            novalidate: true,
            onsubmit: (e) => {
              e.preventDefault();
              if (horario.value && !validarHorario(horario.value)) {
                erro.textContent = "Horário no formato HH:MM.";
                return;
              }
              try {
                salvar(editarRefeicao(dieta, refeicao.id, { nome: nome.value, horario: horario.value }), idTitulo);
              } catch (falha) {
                erro.textContent = falha.message;
                nome.setAttribute("aria-invalid", "true");
                nome.focus();
              }
            }
          },
          h("div", { class: "linha-campos" },
            h("div", { class: "campo" }, h("label", { for: nome.id }, "Nome"), nome),
            h("div", { class: "campo" }, h("label", { for: horario.id }, "Horário"), horario)
          ),
          erro,
          h(
            "div",
            { class: "acoes" },
            h("button", { type: "submit", class: "botao botao-principal" }, "Salvar"),
            h("button", { type: "button", class: "botao", id: `sobe-${refeicao.id}`, disabled: primeira, onclick: () => salvar(moverRefeicao(dieta, refeicao.id, -1), `sobe-${refeicao.id}`) }, "↑ Subir"),
            h("button", { type: "button", class: "botao", id: `desce-${refeicao.id}`, disabled: ultima, onclick: () => salvar(moverRefeicao(dieta, refeicao.id, 1), `desce-${refeicao.id}`) }, "↓ Descer"),
            h(
              "button",
              {
                type: "button",
                class: "botao botao-perigo",
                onclick: () => {
                  if (refeicao.itens.length && !window.confirm(`Remover “${refeicao.nome}” e os ${refeicao.itens.length} alimento(s) dela?`)) return;
                  salvar(removerRefeicao(dieta, refeicao.id), "nova-refeicao");
                  aviso(`${refeicao.nome} removida.`);
                }
              },
              "Remover refeição"
            )
          )
        )
      );

      return h(
        "section",
        { class: "cartao refeicao", "aria-labelledby": idTitulo },
        h(
          "h2",
          { id: idTitulo, tabindex: "-1" },
          refeicao.nome,
          refeicao.horario ? h("span", { class: "horario" }, ` — ${refeicao.horario}`) : null
        ),
        refeicao.itens.length
          ? h("ul", { class: "itens" }, refeicao.itens.map((i) => linhaItem(refeicao, i)))
          : h("p", { class: "nota" }, "Nenhum alimento ainda."),
        blocoAdicionar(refeicao),
        refeicao.itens.length ? subtotal(t, `Subtotal de ${refeicao.nome}`) : null,
        refeicao.itens.length ? avisoIncompleto(t) : null,
        edicao
      );
    }

    /* ---------- resumo do dia ---------- */

    function resumoDoDia() {
      const total = totaisDia(dieta, catalogo.buscar);
      const perfil = lerPerfil();
      const metas = metasDoPerfil(perfil, resumo);

      const porRefeicao = h(
        "div",
        { class: "tabela-rolagem", tabindex: "0", role: "region", "aria-label": "Tabela consumido × meta" },
        h(
          "table",
          {},
          h("caption", {}, "Totais por refeição"),
          h("thead", {}, h("tr", {}, ["Refeição", "kcal", "Proteína", "Carboidrato", "Gordura"].map((c) => h("th", { scope: "col" }, c)))),
          h(
            "tbody",
            {},
            dieta.refeicoes.map((r) => {
              const t = totaisRefeicao(r, catalogo.buscar);
              return h("tr", {}, h("th", { scope: "row" }, r.nome), h("td", {}, fmt(t.kcal)), h("td", {}, `${fmt(t.proteina, 1)} g`), h("td", {}, `${fmt(t.carboidrato, 1)} g`), h("td", {}, `${fmt(t.gordura, 1)} g`));
            })
          ),
          h("tfoot", {}, h("tr", {}, h("th", { scope: "row" }, "Dia"), h("td", {}, fmt(total.kcal)), h("td", {}, `${fmt(total.proteina, 1)} g`), h("td", {}, `${fmt(total.carboidrato, 1)} g`), h("td", {}, `${fmt(total.gordura, 1)} g`)))
        )
      );

      let tabelaMetas;
      if (!metas) {
        tabelaMetas = h("p", { class: "nota" }, "Para comparar com as metas, ", h("a", { href: "#configuracoes" }, "preencha seu perfil"), ".");
      } else {
        const linhas = resumoDiario(total, metas, perfil.peso);
        const porKg = (v, u) => (v === null ? "—" : `${fmt(v, 2)} ${u}/kg`);
        tabelaMetas = h(
          "div",
          { class: "tabela-rolagem", tabindex: "0", role: "region", "aria-label": "Tabela de totais por refeição" },
          h(
            "table",
            { class: "tabela-resumo" },
            h("caption", {}, "Consumido × meta"),
            h("thead", {}, h("tr", {}, ["Indicador", "Consumido", "Meta", "Diferença", "% da meta", "Consumido/kg", "Meta/kg"].map((c) => h("th", { scope: "col" }, c)))),
            h(
              "tbody",
              {},
              linhas.flatMap((l) => {
                const casas = l.chave === "kcal" ? 0 : 1;
                const principal = h(
                  "tr",
                  {},
                  h("th", { scope: "row" }, l.rotulo),
                  h("td", {}, `${fmt(l.consumido, casas)} ${l.unidade}`),
                  h("td", {}, `${fmt(l.meta, casas)} ${l.unidade}`),
                  h("td", {}, sinal(l.diferenca, casas)),
                  h("td", {}, l.percentual === null ? "—" : `${fmt(l.percentual)}%`, h("span", { class: "visually-hidden" }, `, ${ROTULO_ESTADO[l.estado] ?? ""}`)),
                  h("td", {}, porKg(l.consumidoPorKg, l.unidade)),
                  h("td", {}, porKg(l.metaPorKg, l.unidade))
                );
                if (l.chave !== "proteina") return [principal];
                return [
                  principal,
                  h("tr", { class: "sublinha" }, h("th", { scope: "row" }, "├─ Animal"), h("td", {}, `${fmt(total.proteinaAnimal, 1)} g`), h("td", { colspan: "5" })),
                  h("tr", { class: "sublinha" }, h("th", { scope: "row" }, total.proteinaSemTipo > 0.05 ? "├─ Vegetal" : "└─ Vegetal"), h("td", {}, `${fmt(total.proteinaVegetal, 1)} g`), h("td", { colspan: "5" })),
                  total.proteinaSemTipo > 0.05
                    ? h("tr", { class: "sublinha" }, h("th", { scope: "row" }, "└─ Sem tipo"), h("td", {}, `${fmt(total.proteinaSemTipo, 1)} g`), h("td", { colspan: "5" }))
                    : null
                ].filter(Boolean);
              })
            )
          )
        );
      }

      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-resumo", id: "resumo" },
        h("h2", { id: "t-resumo" }, "Resumo do dia"),
        tabelaMetas,
        avisoIncompleto(total),
        porRefeicao
      );
    }

    /* ---------- tela ---------- */

    function desenhar(focoId) {
      const total = totaisDia(dieta, catalogo.buscar);
      const vazia = dieta.refeicoes.every((r) => !r.itens.length);

      const nomeNova = h("input", { id: "nova-refeicao", type: "text", autocomplete: "off", maxlength: "60", placeholder: "ex.: Lanche da noite" });
      const horaNova = h("input", { id: "nova-hora", type: "time" });
      const erroNova = h("p", { class: "erro", "aria-live": "polite" });

      raiz.replaceChildren(
        ...[
          h(
            "header",
            { class: "cabecalho-tela" },
            h("h1", { id: "titulo-tela", tabindex: "-1" }, "Dieta"),
            h("p", { class: "sutil" }, `${fmt(total.kcal)} kcal no dia · `, h("a", { href: "#resumo" }, "ver resumo"))
          ),
          h("p", { class: "nota", id: "dieta-aviso", role: "status" }),
          vazia
            ? h(
                "section",
                { class: "cartao" },
                h("p", {}, "Monte o dia adicionando alimentos às refeições abaixo."),
                h(
                  "button",
                  {
                    type: "button",
                    class: "botao",
                    onclick: () => {
                      salvar(diaDeExemplo(), "titulo-tela");
                      aviso("Dia de exemplo carregado. É fictício: edite ou remova à vontade.");
                    }
                  },
                  "Preencher com um dia de exemplo"
                ),
                h("p", { class: "nota" }, "O exemplo usa só alimentos da TACO. Não é recomendação nem plano de ninguém.")
              )
            : null,
          ...dieta.refeicoes.map(cartaoRefeicao),
          h(
            "section",
            { class: "cartao", "aria-labelledby": "t-nova" },
            h("h2", { id: "t-nova" }, "Nova refeição"),
            h(
              "form",
              {
                class: "formulario",
                novalidate: true,
                onsubmit: (e) => {
                  e.preventDefault();
                  try {
                    const nova = adicionarRefeicao(dieta, nomeNova.value, horaNova.value);
                    salvar(nova, `t-${nova.refeicoes.at(-1).id}`);
                  } catch (falha) {
                    erroNova.textContent = falha.message;
                    nomeNova.setAttribute("aria-invalid", "true");
                    nomeNova.focus();
                  }
                }
              },
              h("div", { class: "linha-campos" },
                h("div", { class: "campo" }, h("label", { for: "nova-refeicao" }, "Nome"), nomeNova),
                h("div", { class: "campo" }, h("label", { for: "nova-hora" }, "Horário (opcional)"), horaNova)
              ),
              erroNova,
              h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Adicionar refeição"))
            )
          ),
          resumoDoDia(),
          avisoSaude()
        ].filter(Boolean)
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
