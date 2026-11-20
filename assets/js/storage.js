/*
 * Única porta para o localStorage (especificação, item 23). Chaves com
 * prefixo, valores em JSON, e falha de armazenamento nunca derruba o app
 * (modo privado, cota cheia, armazenamento bloqueado).
 */

const PREFIXO = "nutrijm:";

export const storage = {
  get(chave, padrao = null) {
    try {
      const bruto = localStorage.getItem(PREFIXO + chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch {
      return padrao;
    }
  },

  set(chave, valor) {
    try {
      localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
      return true;
    } catch {
      return false;
    }
  },

  remove(chave) {
    try {
      localStorage.removeItem(PREFIXO + chave);
    } catch {
      /* nada a fazer */
    }
  }
};
