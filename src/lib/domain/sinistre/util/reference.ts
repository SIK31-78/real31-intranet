/**
 * Référence interne normée `SIN-{ANNEE}-{NNNN}` (CLAUDE.md §10 — clé de
 * rattachement des mails en V3). Générée puis modifiable par l'utilisateur.
 */

const PATTERN = /^SIN-\d{4}-\d{4}$/;

export function genererReference(date = new Date()): string {
  const annee = date.getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000); // 4 chiffres, non séquentiel au MVP
  return `SIN-${annee}-${n}`;
}

export function referenceValide(ref: string): boolean {
  return PATTERN.test(ref.trim());
}
