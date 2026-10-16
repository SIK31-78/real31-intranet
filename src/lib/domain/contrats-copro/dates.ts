// Dates civiles du module « Contrats & contrôles » : des jours ISO "YYYY-MM-DD", comparés
// par chaîne, additionnés en UTC (un jour civil n'a pas de fuseau). Rien ici ne lit
// l'horloge : la date du jour est toujours un paramètre des fonctions qui en ont besoin.
//
// Les deux débordements classiques sont ramenés au dernier jour valide, comme le faisait
// l'ancienne application (une échéance plus tôt vaut mieux qu'une échéance qui glisse) :
// 31/01 + 1 mois = 28/02, 29/02 + 5 ans = 28/02.

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 86_400_000;

function decomposer(iso: string): { a: number; m: number; j: number } {
  const p = iso.slice(0, 10).split("-");
  return { a: Number(p[0]), m: Number(p[1]), j: Number(p[2]) };
}

/** Recompose un jour ISO depuis des composantes (Date.UTC normalise les débordements). */
function composer(a: number, moisIndex: number, j: number): string {
  return new Date(Date.UTC(a, moisIndex, j)).toISOString().slice(0, 10);
}

/** « 2026-02-30 » n'est pas un jour : on exige la forme ET l'existence du jour. */
export function estJourISO(s: string | null | undefined): s is string {
  if (typeof s !== "string" || !JOUR_RE.test(s)) return false;
  const { a, m, j } = decomposer(s);
  return composer(a, m - 1, j) === s;
}

/** Nombre de jours civils de `deISO` à `aISO` (négatif si `aISO` précède). */
export function joursEntre(deISO: string, aISO: string): number {
  return Math.round((Date.parse(`${aISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${deISO.slice(0, 10)}T00:00:00Z`)) / JOUR_MS);
}

export function plusJours(iso: string, n: number): string {
  const { a, m, j } = decomposer(iso);
  return composer(a, m - 1, j + n);
}

/** + n mois, le jour ramené au dernier jour du mois cible s'il déborde (31/01 + 1 = 28/02). */
export function plusMois(iso: string, n: number): string {
  const { a, m, j } = decomposer(iso);
  const moisCible = m - 1 + n;
  const d = new Date(Date.UTC(a, moisCible, j));
  const attendu = ((moisCible % 12) + 12) % 12;
  if (d.getUTCMonth() === attendu) return d.toISOString().slice(0, 10);
  return composer(a, moisCible + 1, 0);
}

/** + n années, un 29 février ramené au 28 si l'année cible n'est pas bissextile. */
export function plusAnnees(iso: string, n: number): string {
  const { a, m, j } = decomposer(iso);
  const d = new Date(Date.UTC(a + n, m - 1, j));
  if (d.getUTCMonth() === m - 1) return d.toISOString().slice(0, 10);
  return composer(a + n, m - 1, j - 1);
}

/** « 2026-03-12 » -> « 12/03/2026 » ; une chaîne illisible est rendue telle quelle. */
export function formatJourFR(iso: string | null | undefined): string {
  if (!iso || !JOUR_RE.test(iso.slice(0, 10))) return iso ?? "";
  const { a, m, j } = decomposer(iso);
  return `${String(j).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}
