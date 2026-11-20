/*
 * Tela "Medicação" (GLP-1 / GIP): início (próxima aplicação, estoque, rodízio e
 * registrar), estoque de canetas, diário (sintomas e evolução) e ajuda.
 * Lógica em meds.js; aqui só DOM. O app só registra o que a pessoa informa.
 */

import {
  APRESENTACOES,
  LOCAIS,
  SINTOMAS,
  normalizar,
  paraData,
  paraTexto,
  validarCaneta,
  salvarCaneta,
  ativarCaneta,
  removerCaneta,
  canetaAtiva,
  saldo,
  validarAplicacao,
  registrarAplicacao,
  removerAplicacao,
  ordenarAplicacoes,
  proximaAplicacao,
  textoTempo,
  usoPorLocal,
  proximoLocal,
  alertas,
  registrarSintomas,
  removerSintomas,
  evolucao
} from "./meds.js";
import { lerMedicoes, dataBr } from "./tela-corpo.js";

const CHAVE = "medicacao";
const VIGIMED = "https://www.gov.br/anvisa/pt-br/assuntos/fiscalizacao-e-monitoramento/notificacoes/vigimed";

const SECOES = [
  ["inicio", "Início"],
  ["estoque", "Estoque"],
  ["diario", "Diário"],
  ["ajuda", "Ajuda"]
];

export function criarTelaMedicacao({ h, storage }) {
  const fmt = (v, casas = 2) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
  const dataHoraBr = (t) => {
    const d = paraData(t);
    return d ? `${dataBr(t.slice(0, 10))} ${t.slice(11, 16)}` : "—";
  };
  const id = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const num = (t) => {
    const s = String(t ?? "").replace(",", ".").trim();
    return s === "" ? null : Number(s);
  };

  function aviso() {
    return h(
      "p",
      { class: "aviso-saude" },
      "O app só registra o que você informa. Dose, intervalo, local e armazenamento seguem a prescrição médica e a bula do seu medicamento. Nunca altere a dose sem orientação médica."
    );
  }

  /* Escreve erros {campo: msg} embaixo dos campos (#prefixo-campo / #prefixo-campo-erro). */
  function marcarErros(form, prefixo, erros) {
    form.querySelectorAll(".erro").forEach((p) => (p.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    const chaves = Object.keys(erros);
    for (const k of chaves) {
      form.querySelector(`#${prefixo}-${k}`)?.setAttribute("aria-invalid", "true");
      const msg = form.querySelector(`#${prefixo}-${k}-erro`);
      if (msg) msg.textContent = erros[k];
    }
    const geral = form.querySelector(".erro-geral");
    if (geral) geral.textContent = chaves.length ? `Revise ${chaves.length === 1 ? "1 campo" : `${chaves.length} campos`}.` : "";
    if (chaves.length) form.querySelector(`#${prefixo}-${chaves[0]}`)?.focus();
    return chaves.length === 0;
  }

  function campo(prefixo, chave, rotulo, atributos = {}, ajuda) {
    const idCampo = `${prefixo}-${chave}`;
    return h(
      "div",
      { class: "campo" },
      h("label", { for: idCampo }, rotulo),
      h("input", { id: idCampo, name: chave, autocomplete: "off", "aria-describedby": `${idCampo}-erro${ajuda ? ` ${idCampo}-ajuda` : ""}`, ...atributos }),
      ajuda ? h("p", { class: "ajuda", id: `${idCampo}-ajuda` }, ajuda) : null,
      h("p", { class: "erro", id: `${idCampo}-erro`, "aria-live": "polite" })
    );
  }

  return function telaMedicacao(secao = "inicio") {
    if (!SECOES.some(([k]) => k === secao)) secao = "inicio";
    const raiz = h("div", { class: "pilha" });
    let estado = normalizar(storage.get(CHAVE));
    let localEscolhido = null;
    let canetaEditando = null;

    function salvar(novo, foco, mensagem = "") {
      estado = novo;
      storage.set(CHAVE, novo);
      desenhar(foco, mensagem);
    }

    /* ---------- início ---------- */

    function cartaoProxima() {
      const p = proximaAplicacao(estado);
      let corpo;
      if (p.estado === "sem-aplicacao") corpo = h("p", {}, "Nenhuma aplicação registrada ainda.");
      else if (p.estado === "sem-intervalo")
        corpo = h("p", {}, `Última aplicação: ${dataHoraBr(p.ultima.dataHora)}. Configure o intervalo da sua prescrição para ver a contagem.`);
      else
        corpo = h(
          "div",
          {},
          h("p", { class: p.estado === "atrasada" ? "contagem atrasada" : "contagem" }, p.estado === "atrasada" ? `Prevista ${textoTempo(p.ms)}` : `Próxima ${textoTempo(p.ms)}`),
          h("p", { class: "nota" }, `Prevista para ${dataHoraBr(paraTexto(p.quando))} · última em ${dataHoraBr(p.ultima.dataHora)}`)
        );

      const intervalo = h("input", { id: "md-intervalo", type: "text", inputmode: "numeric", autocomplete: "off", value: estado.config.intervaloDias ?? "", "aria-describedby": "md-intervalo-erro md-intervalo-ajuda" });
      const erro = h("p", { class: "erro", id: "md-intervalo-erro", "aria-live": "polite" });
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-proxima" },
        h("h2", { id: "t-proxima" }, "Próxima aplicação"),
        corpo,
        h(
          "details",
          { class: "editar-refeicao", open: !estado.config.intervaloDias && p.estado !== "sem-aplicacao" },
          h("summary", {}, estado.config.intervaloDias ? `Intervalo: a cada ${estado.config.intervaloDias} dia(s)` : "Configurar intervalo"),
          h(
            "form",
            {
              class: "formulario",
              novalidate: true,
              onsubmit: (e) => {
                e.preventDefault();
                const v = num(intervalo.value);
                if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 60)) {
                  erro.textContent = "Número inteiro de dias, de 1 a 60 (ou em branco).";
                  intervalo.setAttribute("aria-invalid", "true");
                  intervalo.focus();
                  return;
                }
                salvar({ ...estado, config: { ...estado.config, intervaloDias: v } }, "t-proxima", "Intervalo salvo.");
              }
            },
            h("div", { class: "campo" }, h("label", { for: "md-intervalo" }, "Intervalo entre aplicações (dias)"), intervalo,
              h("p", { class: "ajuda", id: "md-intervalo-ajuda" }, "O da sua prescrição. Ex.: 7 para aplicação semanal. O app não supõe nenhum valor."), erro),
            h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao" }, "Salvar intervalo"))
          )
        )
      );
    }

    function cartaoEstoqueResumo() {
      const caneta = canetaAtiva(estado);
      const lista = alertas(estado);
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-estoque-resumo" },
        h("h2", { id: "t-estoque-resumo" }, "Estoque"),
        caneta
          ? (() => {
              const s = saldo(caneta, estado.aplicacoes);
              return h(
                "div",
                {},
                h("p", { class: "contagem" }, `${s.doses === 1 ? "Resta 1 dose" : `Restam ${s.doses} doses`} / ${fmt(s.restanteMl)} mL`),
                h("p", { class: "nota" }, `${caneta.nome} · ${fmt(caneta.doseMg)} mg por aplicação (${fmt(caneta.volumePorDoseMl)} mL)`)
              );
            })()
          : h("p", {}, "Nenhuma caneta cadastrada. ", h("a", { href: "#medicacao/estoque" }, "Cadastrar no Estoque"), "."),
        lista.length
          ? h(
              "ul",
              { class: "alertas" },
              lista.map((a) => h("li", { class: `alerta-${a.nivel}` }, h("span", { class: "visually-hidden" }, a.nivel === "erro" ? "Atenção: " : a.nivel === "aviso" ? "Aviso: " : "Info: "), a.texto))
            )
          : null
      );
    }

    function mapaRodizio() {
      const uso = usoPorLocal(estado.aplicacoes);
      const sugerido = proximoLocal(estado.aplicacoes);
      if (!localEscolhido) localEscolhido = sugerido;
      return h(
        "fieldset",
        { class: "mapa-rodizio" },
        h("legend", {}, "Local da aplicação"),
        h("p", { class: "ajuda" }, `Sugestão de rodízio: ${LOCAIS[sugerido]} (o usado há mais tempo).`),
        h(
          "div",
          { class: "mapa-grade" },
          Object.entries(LOCAIS).map(([k, rotulo], i) =>
            h(
              "label",
              { class: `local${k === sugerido ? " sugerido" : ""}` },
              h("input", { type: "radio", id: i === 0 ? "ap-local" : null, name: "local", value: k, checked: k === localEscolhido, onchange: () => (localEscolhido = k) }),
              h("span", { class: "local-nome" }, rotulo, k === sugerido ? h("span", { class: "selo" }, " · sugerido") : null),
              h("span", { class: "local-uso" }, uso[k] ? `último: ${dataBr(uso[k].slice(0, 10))}` : "ainda não usado")
            )
          )
        ),
        h("p", { class: "erro", id: "ap-local-erro", "aria-live": "polite" })
      );
    }

    function formAplicacao() {
      const caneta = canetaAtiva(estado);
      const form = h(
        "form",
        { class: "formulario", novalidate: true },
        campo("ap", "dataHora", "Data e hora da aplicação", { type: "datetime-local", value: paraTexto(new Date()), max: paraTexto(new Date()) }, "Esqueceu de registrar? Escolha a data e a hora em que aplicou."),
        h(
          "div",
          { class: "campo" },
          h("label", { for: "ap-canetaId" }, "Descontar de"),
          h(
            "select",
            { id: "ap-canetaId", name: "canetaId" },
            estado.canetas.map((c) => h("option", { value: c.id, selected: c.ativa }, `${c.nome} — ${fmt(c.doseMg)} mg (${saldo(c, estado.aplicacoes).doses} dose(s))`)),
            h("option", { value: "", selected: !caneta }, "Não descontar do estoque")
          ),
          h("p", { class: "erro", id: "ap-canetaId-erro", "aria-live": "polite" })
        ),
        campo("ap", "doseMg", "Dose aplicada (mg) — só se não descontar do estoque", { type: "text", inputmode: "decimal" }),
        mapaRodizio(),
        h("p", { class: "erro-geral", role: "alert" }),
        h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Registrar aplicação"))
      );
      const seletor = form.querySelector("#ap-canetaId");
      const blocoDose = form.querySelector("#ap-doseMg").closest(".campo");
      const atualizarDose = () => (blocoDose.hidden = seletor.value !== "");
      seletor.addEventListener("change", atualizarDose);
      atualizarDose();

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const dados = { canetaId: String(d.get("canetaId") || "") || null, dataHora: String(d.get("dataHora") ?? "").slice(0, 16), local: String(d.get("local") ?? "") };
        const erros = validarAplicacao(estado, dados);
        const dose = num(d.get("doseMg"));
        if (!dados.canetaId && dose !== null && !(dose > 0 && dose <= 100)) erros.doseMg = "Dose entre 0,01 e 100 mg (ou em branco).";
        if (!marcarErros(form, "ap", erros)) return;
        const novo = registrarAplicacao(estado, { id: id("apl"), ...dados, doseMg: dose });
        localEscolhido = null;
        salvar(novo, "t-proxima", `Aplicação registrada: ${dataHoraBr(dados.dataHora)}, ${LOCAIS[dados.local]}.`);
      });

      return h("section", { class: "cartao", "aria-labelledby": "t-registrar" }, h("h2", { id: "t-registrar" }, "Registrar aplicação"), form);
    }

    function ultimasAplicacoes() {
      const lista = ordenarAplicacoes(estado.aplicacoes).slice(0, 10);
      if (!lista.length) return null;
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-aplicacoes" },
        h("h2", { id: "t-aplicacoes" }, "Últimas aplicações"),
        h(
          "ul",
          { class: "itens" },
          lista.map((a) =>
            h(
              "li",
              { class: "item" },
              h("span", { class: "item-nome" }, `${dataHoraBr(a.dataHora)} · ${LOCAIS[a.local] ?? a.local}`),
              h(
                "button",
                {
                  type: "button",
                  class: "botao-icone",
                  "aria-label": `Apagar aplicação de ${dataHoraBr(a.dataHora)}`,
                  onclick: () => {
                    if (!window.confirm(`Apagar a aplicação de ${dataHoraBr(a.dataHora)}? A dose volta para o estoque.`)) return;
                    salvar(removerAplicacao(estado, a.id), "t-aplicacoes", "Aplicação apagada.");
                  }
                },
                "✕"
              ),
              h("span", { class: "item-valores" }, a.doseMg === null ? "dose não informada" : `${fmt(a.doseMg)} mg`, a.volumeMl ? ` · ${fmt(a.volumeMl)} mL do estoque` : " · fora do estoque")
            )
          )
        )
      );
    }

    /* ---------- estoque ---------- */

    function formCaneta() {
      const atual = canetaEditando ? estado.canetas.find((c) => c.id === canetaEditando) : null;
      const v = (k) => (atual && atual[k] != null ? String(atual[k]).replace(".", ",") : "");
      const form = h(
        "form",
        { class: "formulario", novalidate: true },
        campo("cn", "nome", "Medicamento (como está na caixa)", { type: "text", value: atual?.nome ?? "", maxlength: "80" }),
        h(
          "div",
          { class: "campo" },
          h("label", { for: "cn-apresentacao" }, "Apresentação"),
          h("select", { id: "cn-apresentacao", name: "apresentacao" }, Object.entries(APRESENTACOES).map(([k, r]) => h("option", { value: k, selected: atual?.apresentacao === k }, r))),
          h("p", { class: "erro", id: "cn-apresentacao-erro", "aria-live": "polite" })
        ),
        h(
          "div",
          { class: "linha-campos" },
          campo("cn", "doseMg", "Dose por aplicação (mg)", { type: "text", inputmode: "decimal", value: v("doseMg") }),
          campo("cn", "volumePorDoseMl", "Volume por aplicação (mL)", { type: "text", inputmode: "decimal", value: v("volumePorDoseMl") })
        ),
        campo("cn", "volumeTotalMl", "Volume total (mL)", { type: "text", inputmode: "decimal", value: v("volumeTotalMl") }, "Ex.: caixa com 4 canetas de 0,5 mL = 2,0 mL."),
        h(
          "fieldset",
          {},
          h("legend", {}, "Validade (opcional)"),
          h(
            "div",
            { class: "linha-campos" },
            campo("cn", "abertaEm", "Aberta / fora da geladeira em", { type: "date", value: atual?.abertaEm ?? "" }),
            campo("cn", "diasForaGeladeira", "Dias fora da geladeira (da bula)", { type: "text", inputmode: "numeric", value: v("diasForaGeladeira") })
          ),
          h(
            "div",
            { class: "linha-campos" },
            campo("cn", "validade", "Validade da caixa", { type: "date", value: atual?.validade ?? "" }),
            campo("cn", "lote", "Lote", { type: "text", value: atual?.lote ?? "", maxlength: "40" })
          )
        ),
        h("p", { class: "erro-geral", role: "alert" }),
        h(
          "div",
          { class: "acoes" },
          h("button", { type: "submit", class: "botao botao-principal" }, atual ? "Salvar alterações" : "Cadastrar caneta"),
          atual ? h("button", { type: "button", class: "botao", onclick: () => { canetaEditando = null; desenhar("t-caneta"); } }, "Cancelar") : null
        )
      );
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const dias = num(d.get("diasForaGeladeira"));
        const caneta = {
          id: atual?.id ?? id("cnt"),
          nome: String(d.get("nome") ?? "").trim(),
          apresentacao: String(d.get("apresentacao")),
          doseMg: num(d.get("doseMg")),
          volumePorDoseMl: num(d.get("volumePorDoseMl")),
          volumeTotalMl: num(d.get("volumeTotalMl")),
          abertaEm: String(d.get("abertaEm") ?? "") || null,
          diasForaGeladeira: dias,
          validade: String(d.get("validade") ?? "") || null,
          lote: String(d.get("lote") ?? "").trim(),
          ativa: atual ? atual.ativa : true
        };
        if (!marcarErros(form, "cn", validarCaneta(caneta))) return;
        canetaEditando = null;
        salvar(salvarCaneta(estado, caneta), "t-canetas", atual ? "Caneta atualizada." : "Caneta cadastrada e marcada como em uso.");
      });
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-caneta" },
        h("h2", { id: "t-caneta", tabindex: "-1" }, atual ? `Editar ${atual.nome}` : "Cadastrar caneta ou frasco"),
        h("p", { class: "nota" }, "Copie os números da caixa ou da receita. O app não tem catálogo de marcas: uma lista sem conferência numa fonte oficial poderia levar a erro de dose."),
        form
      );
    }

    function listaCanetas() {
      if (!estado.canetas.length) return null;
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-canetas" },
        h("h2", { id: "t-canetas", tabindex: "-1" }, "Canetas e frascos"),
        h(
          "ul",
          { class: "itens" },
          estado.canetas.map((c) => {
            const s = saldo(c, estado.aplicacoes);
            return h(
              "li",
              { class: "caneta" },
              h("p", { class: "item-nome" }, c.nome, c.ativa ? h("span", { class: "selo" }, " · em uso") : null),
              h("p", { class: "item-valores" }, `${APRESENTACOES[c.apresentacao]} · ${fmt(c.doseMg)} mg / ${fmt(c.volumePorDoseMl)} mL por aplicação`),
              h("p", {}, `${s.doses === 1 ? "Resta 1 dose" : `Restam ${s.doses} doses`} · ${fmt(s.restanteMl)} de ${fmt(c.volumeTotalMl)} mL · ${s.aplicacoes} aplicação(ões) registrada(s)`),
              c.validade || c.lote ? h("p", { class: "nota" }, [c.validade ? `Validade: ${dataBr(c.validade)}` : null, c.lote ? `Lote: ${c.lote}` : null].filter(Boolean).join(" · ")) : null,
              h(
                "div",
                { class: "acoes" },
                c.ativa ? null : h("button", { type: "button", class: "botao", onclick: () => salvar(ativarCaneta(estado, c.id), "t-canetas", `${c.nome} agora está em uso.`) }, "Usar esta"),
                h("button", { type: "button", class: "botao", onclick: () => { canetaEditando = c.id; desenhar("t-caneta"); } }, "Editar"),
                h(
                  "button",
                  {
                    type: "button",
                    class: "botao botao-perigo",
                    onclick: () => {
                      if (!window.confirm(`Remover ${c.nome} do estoque? As aplicações registradas continuam no histórico.`)) return;
                      salvar(removerCaneta(estado, c.id), "t-caneta", `${c.nome} removida do estoque.`);
                    }
                  },
                  "Remover"
                )
              )
            );
          })
        )
      );
    }

    /* ---------- diário ---------- */

    function formSintomas() {
      const form = h(
        "form",
        { class: "formulario", novalidate: true },
        campo("st", "data", "Data", { type: "date", value: paraTexto(new Date(), false), max: paraTexto(new Date(), false) }),
        h(
          "fieldset",
          { class: "opcoes" },
          h("legend", {}, "Como você se sentiu?"),
          Object.entries(SINTOMAS).map(([k, r]) => h("label", { class: "opcao-check" }, h("input", { type: "checkbox", name: "itens", value: k }), ` ${r}`))
        ),
        h("div", { class: "campo" }, h("label", { for: "st-observacao" }, "Observação (opcional)"), h("textarea", { id: "st-observacao", name: "observacao", rows: "2", maxlength: "280" })),
        h("p", { class: "erro-geral", role: "alert" }),
        h("div", { class: "acoes" }, h("button", { type: "submit", class: "botao botao-principal" }, "Salvar check-in"))
      );
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = new FormData(form);
        try {
          salvar(registrarSintomas(estado, { id: id("sin"), data: String(d.get("data") ?? ""), itens: d.getAll("itens").map(String), observacao: String(d.get("observacao") ?? "") }), "t-sintomas-hist", "Check-in salvo.");
        } catch (falha) {
          const geral = form.querySelector(".erro-geral");
          geral.textContent = falha.message;
          form.querySelector("input")?.focus();
        }
      });
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-sintomas" },
        h("h2", { id: "t-sintomas" }, "Check-in de sintomas"),
        form,
        h("p", { class: "nota" }, "Sintoma forte ou que não passa: procure atendimento. Para relatar um evento adverso à Anvisa, veja a Ajuda.")
      );
    }

    function historicoSintomas() {
      const lista = [...estado.sintomas].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 20);
      if (!lista.length) return null;
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-sintomas-hist" },
        h("h2", { id: "t-sintomas-hist", tabindex: "-1" }, "Check-ins"),
        h(
          "ul",
          { class: "itens" },
          lista.map((s) =>
            h(
              "li",
              { class: "item" },
              h("span", { class: "item-nome" }, `${dataBr(s.data)} · ${s.itens.map((k) => SINTOMAS[k]).join(", ")}`),
              h(
                "button",
                { type: "button", class: "botao-icone", "aria-label": `Apagar check-in de ${dataBr(s.data)}`, onclick: () => salvar(removerSintomas(estado, s.id), "t-sintomas", "Check-in apagado.") },
                "✕"
              ),
              s.observacao ? h("span", { class: "item-valores" }, s.observacao) : null
            )
          )
        )
      );
    }

    function evolucaoDosePeso() {
      const linhas = evolucao(estado.aplicacoes, lerMedicoes(storage));
      return h(
        "section",
        { class: "cartao", "aria-labelledby": "t-evolucao" },
        h("h2", { id: "t-evolucao" }, "Evolução: dose × peso"),
        linhas.length
          ? h(
              "div",
              { class: "tabela-rolagem", tabindex: "0", role: "region", "aria-label": "Tabela de evolução de dose e peso" },
              h(
                "table",
                {},
                h("caption", { class: "visually-hidden" }, "Cada aplicação com o peso da última medição até aquela data"),
                h("thead", {}, h("tr", {}, ["Aplicação", "Dose", "Peso", "Medido em"].map((c) => h("th", { scope: "col" }, c)))),
                h(
                  "tbody",
                  {},
                  linhas.map((l) =>
                    h(
                      "tr",
                      {},
                      h("th", { scope: "row" }, dataBr(l.dataHora.slice(0, 10))),
                      h("td", {}, l.doseMg === null ? "—" : `${fmt(l.doseMg)} mg`),
                      h("td", {}, l.peso === null ? "—" : `${fmt(l.peso, 1)} kg`),
                      h("td", {}, l.pesoEm ? dataBr(l.pesoEm) : "—")
                    )
                  )
                )
              )
            )
          : h("p", {}, "Aparece aqui depois da primeira aplicação."),
        h("p", { class: "nota" }, "O peso vem das medições da aba ", h("a", { href: "#corpo" }, "Corpo"), ", com IMC e composição corporal. O gráfico fica para uma próxima versão.")
      );
    }

    /* ---------- ajuda ---------- */

    const FAQ = [
      ["Como funciona o cálculo do estoque em mL?", "Ao cadastrar a caixa, informe o volume total (ex.: 4 canetas de 0,5 mL = 2,0 mL) e o volume de cada aplicação. A cada aplicação registrada, o app desconta esse volume e mostra as doses restantes; avisa quando resta 1."],
      ["Esqueci de registrar no dia. Como faço?", "Em “Registrar aplicação”, escolha a data e a hora em que aplicou. A contagem da próxima é refeita a partir dela, com o intervalo que você configurou."],
      ["De onde vem o intervalo entre aplicações?", "Da sua prescrição. O app não supõe nenhum valor: sem intervalo configurado, ele não mostra contagem."],
      ["Como guardar as canetas?", "Siga a bula da sua marca: ela diz a temperatura de armazenamento e por quantos dias a caneta pode ficar fora da geladeira depois de aberta. Esse número entra no cadastro da caneta, e o app conta os dias."],
      ["Onde aplicar?", "Nos locais que a bula e a sua equipe de saúde indicarem. O mapa de rodízio só ajuda a alternar entre eles, sugerindo o usado há mais tempo."],
      ["Como descartar agulhas e canetas?", "Em recipiente rígido e fechado, nunca no lixo comum. Pergunte na farmácia ou na unidade de saúde onde entregar."],
      ["Por que não há lista de marcas?", "Para não arriscar um erro de dose: o app só traria um catálogo conferido numa fonte oficial. Por enquanto, você copia os dados da caixa."],
      ["O app substitui consulta médica?", "Não. É só uma ferramenta pessoal de organização e histórico. Os dados ficam neste navegador, e nada é enviado."]
    ];

    function ajuda() {
      return [
        h(
          "section",
          { class: "cartao", "aria-labelledby": "t-faq" },
          h("h2", { id: "t-faq" }, "Perguntas frequentes"),
          ...FAQ.map(([p, r]) => h("details", { class: "faq" }, h("summary", {}, p), h("p", {}, r)))
        ),
        h(
          "section",
          { class: "cartao", "aria-labelledby": "t-contato" },
          h("h2", { id: "t-contato" }, "Evento adverso"),
          h("p", {}, "Teve uma reação que não esperava? Fale com quem prescreveu e, se quiser, notifique a Anvisa:"),
          h("p", {}, h("a", { href: VIGIMED, target: "_blank", rel: "noopener noreferrer" }, "VigiMed — notificar evento adverso à Anvisa (abre em outra aba)"))
        )
      ];
    }

    /* ---------- tela ---------- */

    function desenhar(focoId, mensagem = "") {
      const sub = h(
        "nav",
        { class: "subnav", "aria-label": "Seções de Medicação" },
        SECOES.map(([k, rotulo]) => h("a", { href: k === "inicio" ? "#medicacao" : `#medicacao/${k}`, "aria-current": k === secao ? "page" : null }, rotulo))
      );
      const conteudoSecao = {
        inicio: () => [cartaoProxima(), cartaoEstoqueResumo(), formAplicacao(), ultimasAplicacoes()],
        estoque: () => [listaCanetas(), formCaneta()],
        diario: () => [formSintomas(), historicoSintomas(), evolucaoDosePeso()],
        ajuda
      }[secao]();

      raiz.replaceChildren(
        ...[
          h(
            "header",
            { class: "cabecalho-tela" },
            h("h1", { id: "titulo-tela", tabindex: "-1" }, `Medicação${secao === "inicio" ? "" : ` · ${SECOES.find(([k]) => k === secao)[1]}`}`),
            h("p", { class: "sutil" }, "Controle de aplicações e estoque de canetas (GLP-1 / GIP).")
          ),
          sub,
          h("p", { class: "nota", id: "med-aviso", role: "status" }, mensagem),
          ...conteudoSecao,
          aviso()
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
