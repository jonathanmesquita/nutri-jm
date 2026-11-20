/*
 * Medicação (GLP-1 / GIP): canetas em estoque, aplicações, próxima aplicação, rodízio
 * de locais, alertas e sintomas. Sem DOM, para ter teste.
 *
 * O app SÓ REGISTRA o que a pessoa informa. Dose, volume, intervalo entre aplicações e
 * validade fora da geladeira vêm da caixa, da bula ou da prescrição — o app nunca
 * sugere nem corrige nenhum desses números. Não há catálogo de marcas embutido: a lista
 * da especificação não pôde ser conferida numa fonte oficial (ver README).
 *
 * Salvo em storage("medicacao"):
 *   { versao: 1,
 *     config: { intervaloDias, avisoDoses },
 *     canetas: [{ id, nome, apresentacao, volumeTotalMl, doseMg, volumePorDoseMl,
 *                 abertaEm, diasForaGeladeira, validade, lote, ativa }],
 *     aplicacoes: [{ id, canetaId, dataHora: "AAAA-MM-DDTHH:MM", local, doseMg, volumeMl }],
 *     sintomas: [{ id, data: "AAAA-MM-DD", itens: [chave], observacao }] }
 */

export const APRESENTACOES = {
  "dose-unica": "Caneta de dose única",
  multidose: "Caneta multidose",
  frasco: "Frasco"
};

/* Locais do mapa de rodízio, na ordem em que aparecem na tela. */
export const LOCAIS = {
  "braco-esquerdo": "Braço esquerdo",
  "braco-direito": "Braço direito",
  "abdomen-esquerdo": "Abdômen esquerdo",
  "abdomen-direito": "Abdômen direito",
  "coxa-esquerda": "Coxa esquerda",
  "coxa-direita": "Coxa direita"
};

export const SINTOMAS = {
  nausea: "Náusea",
  fadiga: "Fadiga",
  constipacao: "Constipação",
  azia: "Azia",
  refluxo: "Refluxo",
  nenhum: "Nenhum"
};

const EPS = 1e-9;
const DIA = 86400000;

/* ---------- estrutura ---------- */

export function estadoVazio() {
  return { versao: 1, config: { intervaloDias: null, avisoDoses: 1 }, canetas: [], aplicacoes: [], sintomas: [] };
}

export function normalizar(bruto) {
  const v = estadoVazio();
  if (!bruto || typeof bruto !== "object") return v;
  const cfg = bruto.config ?? {};
  return {
    versao: 1,
    config: {
      intervaloDias: Number.isFinite(cfg.intervaloDias) && cfg.intervaloDias > 0 ? cfg.intervaloDias : null,
      avisoDoses: Number.isFinite(cfg.avisoDoses) && cfg.avisoDoses >= 0 ? cfg.avisoDoses : 1
    },
    canetas: Array.isArray(bruto.canetas) ? bruto.canetas.filter((c) => c && c.id && c.volumeTotalMl > 0 && c.volumePorDoseMl > 0) : [],
    aplicacoes: Array.isArray(bruto.aplicacoes) ? bruto.aplicacoes.filter((a) => a && a.id && paraData(a.dataHora)) : [],
    sintomas: Array.isArray(bruto.sintomas) ? bruto.sintomas.filter((s) => s && s.id && Array.isArray(s.itens)) : []
  };
}

/* ---------- datas (sempre no horário local) ---------- */

/* "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM" → Date local, ou null se não for uma data que existe. */
export function paraData(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/.exec(String(texto ?? ""));
  if (!m) return null;
  const [, a, mes, d, hh = "00", mm = "00"] = m;
  const dt = new Date(Number(a), Number(mes) - 1, Number(d), Number(hh), Number(mm));
  return dt.getFullYear() === Number(a) && dt.getMonth() === Number(mes) - 1 && dt.getDate() === Number(d) ? dt : null;
}

export function paraTexto(dt, comHora = true) {
  const p = (n) => String(n).padStart(2, "0");
  const dia = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  return comHora ? `${dia}T${p(dt.getHours())}:${p(dt.getMinutes())}` : dia;
}

const inicioDoDia = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
const diasEntre = (de, ate) => Math.round((inicioDoDia(ate) - inicioDoDia(de)) / DIA);

/* ---------- canetas ---------- */

/* Valida uma caneta digitada. Devolve {campo: mensagem}. */
export function validarCaneta(c) {
  const erros = {};
  if (!c.nome || !c.nome.trim()) erros.nome = "Informe o nome que está na caixa.";
  if (!(c.apresentacao in APRESENTACOES)) erros.apresentacao = "Escolha a apresentação.";
  const faixa = (campo, min, max, msg) => {
    const v = c[campo];
    if (!Number.isFinite(v) || v < min || v > max) erros[campo] = msg;
  };
  faixa("volumeTotalMl", 0.05, 100, "Volume total entre 0,05 e 100 mL.");
  faixa("volumePorDoseMl", 0.01, 10, "Volume por aplicação entre 0,01 e 10 mL.");
  faixa("doseMg", 0.01, 100, "Dose entre 0,01 e 100 mg.");
  if (!erros.volumeTotalMl && !erros.volumePorDoseMl && c.volumePorDoseMl > c.volumeTotalMl + EPS) {
    erros.volumePorDoseMl = "O volume por aplicação não pode passar do volume total.";
  }
  if (c.abertaEm && !paraData(c.abertaEm)) erros.abertaEm = "Data inválida.";
  if (c.validade && !paraData(c.validade)) erros.validade = "Data inválida.";
  if (c.diasForaGeladeira !== null && c.diasForaGeladeira !== undefined) {
    if (!Number.isInteger(c.diasForaGeladeira) || c.diasForaGeladeira < 1 || c.diasForaGeladeira > 365) {
      erros.diasForaGeladeira = "Número inteiro de dias, de 1 a 365.";
    }
  }
  return erros;
}

export function salvarCaneta(estado, caneta) {
  const existe = estado.canetas.some((c) => c.id === caneta.id);
  let canetas = existe ? estado.canetas.map((c) => (c.id === caneta.id ? caneta : c)) : [...estado.canetas, caneta];
  /* uma caneta ativa por vez: é dela que "Registrar aplicação" desconta */
  /* nenhuma ativa depois de salvar: a que acabou de ser salva passa a ser */
  if (caneta.ativa || !canetas.some((c) => c.ativa)) canetas = canetas.map((c) => ({ ...c, ativa: c.id === caneta.id }));
  return { ...estado, canetas };
}

export function ativarCaneta(estado, id) {
  return { ...estado, canetas: estado.canetas.map((c) => ({ ...c, ativa: c.id === id })) };
}

/* Remover a caneta não apaga o histórico: as aplicações ficam, sem desconto. */
export function removerCaneta(estado, id) {
  return { ...estado, canetas: estado.canetas.filter((c) => c.id !== id) };
}

export function canetaAtiva(estado) {
  return estado.canetas.find((c) => c.ativa) ?? null;
}

/*
 * Saldo (especificação, item 2):
 *   volume restante = volume total − Σ volume das aplicações desta caneta
 *   doses restantes = ⌊ volume restante ÷ volume por aplicação ⌋
 */
export function saldo(caneta, aplicacoes) {
  const usado = aplicacoes.filter((a) => a.canetaId === caneta.id).reduce((s, a) => s + a.volumeMl, 0);
  const restanteMl = Math.max(0, caneta.volumeTotalMl - usado);
  const doses = Math.floor(restanteMl / caneta.volumePorDoseMl + EPS);
  return { usadoMl: usado, restanteMl: Math.round(restanteMl * 1000) / 1000, doses, aplicacoes: aplicacoes.filter((a) => a.canetaId === caneta.id).length };
}

/* ---------- aplicações ---------- */

export function validarAplicacao(estado, { canetaId, dataHora, local }, agora = new Date()) {
  const erros = {};
  const dt = paraData(dataHora);
  if (!dt || !/T/.test(dataHora)) erros.dataHora = "Informe data e hora.";
  else if (dt.getTime() > agora.getTime() + 60000) erros.dataHora = "A aplicação não pode estar no futuro.";
  if (!(local in LOCAIS)) erros.local = "Escolha o local da aplicação.";
  if (canetaId) {
    const caneta = estado.canetas.find((c) => c.id === canetaId);
    if (!caneta) erros.canetaId = "Caneta não encontrada.";
    else if (saldo(caneta, estado.aplicacoes).doses < 1) erros.canetaId = "Esta caneta não tem mais dose registrada. Cadastre a nova no Estoque.";
  }
  return erros;
}

/*
 * Registra uma aplicação. Com caneta, a dose e o volume são os cadastrados nela (e o
 * volume é descontado do estoque); sem caneta, a pessoa informa a dose (ou deixa em branco).
 */
export function registrarAplicacao(estado, { id, canetaId, dataHora, local, doseMg = null }, agora = new Date()) {
  const erros = validarAplicacao(estado, { canetaId, dataHora, local }, agora);
  if (Object.keys(erros).length) {
    const e = new Error(Object.values(erros)[0]);
    e.erros = erros;
    throw e;
  }
  const caneta = canetaId ? estado.canetas.find((c) => c.id === canetaId) : null;
  const aplicacao = {
    id,
    canetaId: caneta ? caneta.id : null,
    dataHora,
    local,
    doseMg: caneta ? caneta.doseMg : Number.isFinite(doseMg) ? doseMg : null,
    volumeMl: caneta ? caneta.volumePorDoseMl : 0
  };
  return { ...estado, aplicacoes: [...estado.aplicacoes, aplicacao] };
}

export function removerAplicacao(estado, id) {
  return { ...estado, aplicacoes: estado.aplicacoes.filter((a) => a.id !== id) };
}

export function ordenarAplicacoes(aplicacoes) {
  return [...aplicacoes].sort((a, b) => (a.dataHora < b.dataHora ? 1 : a.dataHora > b.dataHora ? -1 : 0));
}

/*
 * Próxima aplicação = última + intervalo que a pessoa configurou (a prescrição dela).
 * Sem intervalo configurado, o app não calcula: não supõe "semanal" por conta própria.
 */
export function proximaAplicacao(estado, agora = new Date()) {
  const ultima = ordenarAplicacoes(estado.aplicacoes)[0];
  const intervalo = estado.config.intervaloDias;
  if (!ultima) return { estado: "sem-aplicacao" };
  if (!intervalo) return { estado: "sem-intervalo", ultima };
  const quando = new Date(paraData(ultima.dataHora).getTime() + intervalo * DIA);
  const ms = quando - agora;
  return { estado: ms < 0 ? "atrasada" : "agendada", ultima, quando, ms };
}

/* "em 2 dias e 5 h", "em 3 h e 10 min", "há 1 dia e 2 h" */
export function textoTempo(ms) {
  const abs = Math.abs(ms);
  const dias = Math.floor(abs / DIA);
  const horas = Math.floor((abs % DIA) / 3600000);
  const min = Math.floor((abs % 3600000) / 60000);
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  let corpo;
  if (dias > 0) corpo = horas ? `${plural(dias, "dia", "dias")} e ${horas} h` : plural(dias, "dia", "dias");
  else if (horas > 0) corpo = min ? `${horas} h e ${min} min` : `${horas} h`;
  else corpo = plural(Math.max(min, abs > 0 ? 1 : 0), "minuto", "minutos");
  return ms < 0 ? `há ${corpo}` : `em ${corpo}`;
}

/* ---------- rodízio ---------- */

/* Última vez que cada local foi usado (ou null). */
export function usoPorLocal(aplicacoes) {
  const uso = Object.fromEntries(Object.keys(LOCAIS).map((k) => [k, null]));
  for (const a of ordenarAplicacoes(aplicacoes)) if (a.local in uso && !uso[a.local]) uso[a.local] = a.dataHora;
  return uso;
}

/*
 * Sugestão de rodízio: o local usado há mais tempo (nunca usado vem antes, na ordem do
 * mapa). Só alterna os locais para não repetir o mesmo ponto; não é orientação médica.
 */
export function proximoLocal(aplicacoes) {
  const uso = usoPorLocal(aplicacoes);
  return Object.keys(LOCAIS).sort((a, b) => {
    if (uso[a] === uso[b]) return 0;
    if (!uso[a]) return -1;
    if (!uso[b]) return 1;
    return uso[a] < uso[b] ? -1 : 1;
  })[0];
}

/* ---------- alertas ---------- */

/*
 * Alertas da caneta ativa: estoque no fim, compra prevista (doses restantes × intervalo),
 * prazo fora da geladeira (abertura + dias da bula) e validade da caixa.
 */
export function alertas(estado, agora = new Date()) {
  const lista = [];
  const caneta = canetaAtiva(estado);
  if (!caneta) return lista;
  const s = saldo(caneta, estado.aplicacoes);
  if (s.doses === 0) lista.push({ nivel: "erro", texto: `${caneta.nome}: sem dose registrada no estoque.` });
  else if (s.doses <= estado.config.avisoDoses) lista.push({ nivel: "aviso", texto: `${caneta.nome}: ${s.doses === 1 ? "resta 1 aplicação" : `restam ${s.doses} aplicações`}.` });

  if (s.doses > 0 && estado.config.intervaloDias) {
    const prox = proximaAplicacao(estado, agora);
    const base = prox.quando ?? agora;
    const ultimaComEstoque = new Date(base.getTime() + (s.doses - 1) * estado.config.intervaloDias * DIA);
    const dias = diasEntre(agora, ultimaComEstoque);
    lista.push({
      nivel: dias <= 7 ? "aviso" : "info",
      texto: `Pelo intervalo configurado, o estoque dura até ${paraTexto(ultimaComEstoque, false).split("-").reverse().join("/")} (${dias <= 0 ? "a próxima é a última" : `${dias} dia(s)`}).`
    });
  }

  if (caneta.abertaEm && caneta.diasForaGeladeira) {
    const limite = new Date(paraData(caneta.abertaEm).getTime() + caneta.diasForaGeladeira * DIA);
    const dias = diasEntre(agora, limite);
    lista.push({
      nivel: dias < 0 ? "erro" : dias <= 3 ? "aviso" : "info",
      texto: dias < 0 ? `Prazo fora da geladeira informado venceu há ${-dias} dia(s).` : `Prazo fora da geladeira informado: ${dias} dia(s) restante(s).`
    });
  }

  if (caneta.validade) {
    const dias = diasEntre(agora, paraData(caneta.validade));
    if (dias < 0) lista.push({ nivel: "erro", texto: `A validade da caixa informada venceu há ${-dias} dia(s).` });
    else if (dias <= 30) lista.push({ nivel: "aviso", texto: `A validade da caixa informada vence em ${dias} dia(s).` });
  }
  return lista;
}

/* ---------- sintomas ---------- */

export function registrarSintomas(estado, { id, data, itens, observacao = "" }) {
  if (!paraData(data)) throw new Error("Informe a data.");
  const validos = [...new Set(itens)].filter((k) => k in SINTOMAS);
  if (!validos.length) throw new Error("Marque ao menos uma opção (ou “Nenhum”).");
  if (validos.includes("nenhum") && validos.length > 1) throw new Error("“Nenhum” não combina com outros sintomas.");
  if (observacao.length > 280) throw new Error("Observação até 280 caracteres.");
  return { ...estado, sintomas: [...estado.sintomas, { id, data, itens: validos, observacao: observacao.trim() }] };
}

export function removerSintomas(estado, id) {
  return { ...estado, sintomas: estado.sintomas.filter((s) => s.id !== id) };
}

/* ---------- evolução ---------- */

/*
 * Linha do tempo dose × peso: cada aplicação com o peso da última medição até aquela data
 * (aba Corpo). Sem medição até ali, peso null — não interpola.
 */
export function evolucao(aplicacoes, medicoes) {
  const meds = [...medicoes].sort((a, b) => (a.data < b.data ? -1 : 1));
  return [...aplicacoes]
    .sort((a, b) => (a.dataHora < b.dataHora ? -1 : 1))
    .map((a) => {
      const dia = a.dataHora.slice(0, 10);
      const m = meds.filter((x) => x.data <= dia).at(-1) ?? null;
      return { dataHora: a.dataHora, doseMg: a.doseMg, peso: m ? m.peso : null, pesoEm: m ? m.data : null };
    });
}
