/*
 * Backup (especificação, item 24): exportar e importar todos os dados do app em JSON.
 * Sem DOM. A importação confere o arquivo inteiro antes de gravar qualquer coisa:
 * arquivo errado não deixa o app pela metade.
 */

import { validarPerfil } from "./calculations.js";
import { normalizarDieta } from "./diet.js";
import { normalizarLista } from "./shopping.js";
import { normalizar as normalizarMedicacao } from "./meds.js";
import { validarMedicao } from "./body.js";
import { validarAlimento } from "./foods.js";

export const APP_BACKUP = "nutri-jm";
export const VERSAO_BACKUP = 1;
export const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB

/* Toda chave que o app grava. Chave nova no app entra aqui, senão fica fora do backup. */
export const CHAVES = ["perfil", "dieta", "alimentos", "medicoes", "preferencias", "compras", "medicacao"];

export function nomeArquivo(agora = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `nutri-jm-backup-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}.json`;
}

export function exportar(storage, agora = new Date()) {
  const dados = {};
  for (const chave of CHAVES) {
    const v = storage.get(chave);
    if (v !== null && v !== undefined) dados[chave] = v;
  }
  return { app: APP_BACKUP, versao: VERSAO_BACKUP, exportadoEm: agora.toISOString(), dados };
}

/* Quantos registros de cada tipo: para a pessoa conferir antes de importar. */
export function resumo(dados) {
  return {
    perfil: dados.perfil ? 1 : 0,
    refeicoes: dados.dieta?.refeicoes?.length ?? 0,
    alimentosProprios: Array.isArray(dados.alimentos) ? dados.alimentos.length : 0,
    medicoes: Array.isArray(dados.medicoes) ? dados.medicoes.length : 0,
    itensDeCompra: dados.compras?.itens?.length ?? 0,
    canetas: dados.medicacao?.canetas?.length ?? 0,
    aplicacoes: dados.medicacao?.aplicacoes?.length ?? 0
  };
}

/*
 * Lê o texto do arquivo e devolve { ok: true, dados, resumo, exportadoEm } ou
 * { ok: false, erro }. Nada é gravado aqui.
 */
export function lerBackup(texto, hoje = new Date()) {
  if (typeof texto !== "string" || !texto.trim()) return { ok: false, erro: "O arquivo está vazio." };
  if (texto.length > TAMANHO_MAXIMO) return { ok: false, erro: "Arquivo grande demais para um backup do Nutri JM (máximo 5 MB)." };
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "O arquivo não é um JSON válido." };
  }
  if (!bruto || bruto.app !== APP_BACKUP || typeof bruto.dados !== "object" || bruto.dados === null || Array.isArray(bruto.dados)) {
    return { ok: false, erro: "Este arquivo não é um backup do Nutri JM." };
  }
  if (bruto.versao !== VERSAO_BACKUP) return { ok: false, erro: `Versão de backup ${bruto.versao} não suportada por esta versão do app.` };

  const d = bruto.dados;
  const dados = {};
  const falha = (erro) => ({ ok: false, erro });

  if ("perfil" in d) {
    const p = d.perfil;
    if (!p || typeof p !== "object") return falha("O perfil do backup está corrompido.");
    const erros = validarPerfil(p);
    if (Object.keys(erros).length) return falha(`O perfil do backup tem valor inválido em: ${Object.keys(erros).join(", ")}.`);
    dados.perfil = p;
  }
  if ("dieta" in d) {
    if (!d.dieta || !Array.isArray(d.dieta.refeicoes)) return falha("A dieta do backup está corrompida.");
    dados.dieta = normalizarDieta(d.dieta);
  }
  if ("alimentos" in d) {
    if (!Array.isArray(d.alimentos)) return falha("Os alimentos cadastrados no backup estão corrompidos.");
    for (const a of d.alimentos) {
      if (!a || typeof a.id !== "string" || Object.keys(validarAlimento(a)).length) {
        return falha(`Alimento cadastrado inválido no backup: ${a?.nome ?? "sem nome"}.`);
      }
    }
    dados.alimentos = d.alimentos;
  }
  if ("medicoes" in d) {
    if (!Array.isArray(d.medicoes)) return falha("As medições do backup estão corrompidas.");
    for (const m of d.medicoes) {
      if (!m || typeof m.id !== "string" || Object.keys(validarMedicao(m, hoje)).length) {
        return falha(`Medição inválida no backup: ${m?.data ?? "sem data"}.`);
      }
    }
    dados.medicoes = d.medicoes;
  }
  if ("preferencias" in d) {
    if (!d.preferencias || typeof d.preferencias !== "object") return falha("As preferências do backup estão corrompidas.");
    dados.preferencias = { avatar: d.preferencias.avatar !== false };
  }
  if ("compras" in d) {
    if (!d.compras || !Array.isArray(d.compras.itens)) return falha("A lista de compras do backup está corrompida.");
    dados.compras = normalizarLista(d.compras);
  }
  if ("medicacao" in d) {
    if (!d.medicacao || typeof d.medicacao !== "object") return falha("Os dados de medicação do backup estão corrompidos.");
    dados.medicacao = normalizarMedicacao(d.medicacao);
  }
  return { ok: true, dados, resumo: resumo(dados), exportadoEm: typeof bruto.exportadoEm === "string" ? bruto.exportadoEm : null };
}

/*
 * Grava o backup já conferido. Substitui tudo: chave que não está no backup é apagada,
 * para o navegador ficar igual ao que foi exportado. Devolve false se o navegador recusar.
 */
export function importar(storage, dados) {
  for (const chave of CHAVES) storage.remove(chave);
  for (const [chave, valor] of Object.entries(dados)) {
    if (!CHAVES.includes(chave)) continue;
    if (!storage.set(chave, valor)) return false;
  }
  return true;
}

export function apagarTudo(storage) {
  for (const chave of CHAVES) storage.remove(chave);
}
