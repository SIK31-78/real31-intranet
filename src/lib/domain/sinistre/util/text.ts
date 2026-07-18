/** Utilitaires texte partagés. */

const COMBINING = /[̀-ͯ]/g;

/** Minuscule + désaccentuation (pour recherche/filtre insensibles aux accents). */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(COMBINING, '').toLowerCase();
}
