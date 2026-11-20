/*
 * Catálogo de alimentos que o app enxerga: os cadastrados por quem usa (no
 * armazenamento) mais os da TACO. Fonte única para Alimentos, Dieta e Hoje.
 */

import { ALIMENTOS } from "../../data/foods.js";

export const CHAVE_PROPRIOS = "alimentos";

export function criarCatalogo(storage) {
  const proprios = () => storage.get(CHAVE_PROPRIOS, []);
  const todos = () => [...proprios(), ...ALIMENTOS];
  const buscar = (id) => proprios().find((a) => a.id === id) ?? ALIMENTOS.find((a) => a.id === id) ?? null;
  return { proprios, todos, buscar };
}
