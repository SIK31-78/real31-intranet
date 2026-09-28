// Filtre de l'historique des facturations (/facturation, remontee 98512f3a) : une barre
// de recherche libre + une periode, plutot que des listes deroulantes (preference Sekou).
//
// La recherche porte sur un CORPUS par facture (code et nom de copro, type, auteur,
// libelle) ; chaque mot saisi doit s'y trouver (ET), sans accents ni casse.

import { normaliserTexte } from "@/lib/domain/cles/normaliser";

export type PeriodeHistorique = "30j" | "3m" | "12m" | "tout";

export const PERIODES_HISTORIQUE: { value: PeriodeHistorique; label: string }[] = [
  { value: "30j", label: "30 jours" },
  { value: "3m", label: "3 mois" },
  { value: "12m", label: "12 mois" },
  { value: "tout", label: "Tout" },
];

/** Premier instant de la periode (null = pas de borne). */
export function debutPeriode(periode: PeriodeHistorique, maintenant: Date): Date | null {
  const d = new Date(maintenant);
  if (periode === "30j") d.setDate(d.getDate() - 30);
  else if (periode === "3m") d.setMonth(d.getMonth() - 3);
  else if (periode === "12m") d.setFullYear(d.getFullYear() - 1);
  else return null;
  return d;
}

/** Chaque mot de la recherche se trouve-t-il dans le corpus ? Recherche vide = oui. */
export function correspond(corpus: string, recherche: string): boolean {
  const mots = normaliserTexte(recherche).split(" ").filter(Boolean);
  if (mots.length === 0) return true;
  const texte = normaliserTexte(corpus);
  return mots.every((m) => texte.includes(m));
}

export function filtrerHistorique<T extends { creeLe: string }>(
  factures: T[],
  corpus: (f: T) => string,
  filtre: { recherche: string; periode: PeriodeHistorique },
  maintenant: Date,
): T[] {
  const borne = debutPeriode(filtre.periode, maintenant)?.getTime() ?? null;
  return factures.filter(
    (f) => (borne === null || new Date(f.creeLe).getTime() >= borne) && correspond(corpus(f), filtre.recherche),
  );
}
