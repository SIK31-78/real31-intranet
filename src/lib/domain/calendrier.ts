// Domaine du calendrier AG/CS : types metier + derivations pures.
// Ne depend que du domaine (cf. ADR-001).

import type { Jalon } from "@/lib/domain/commun";

/** AG ordinaire, AG extraordinaire, conseil syndical. */
export type TypeEvenement = "AG" | "AGE" | "CS";

export type StatutEvenement = "planifiee" | "convoquee" | "tenue" | "annulee";

export interface Evenement {
  id: string;
  coproCode: string;
  /** Nom court affiche dans les chips, ex "Les Marronniers". */
  coproNomCourt: string;
  type: TypeEvenement;
  statut: StatutEvenement;
  /** Date ISO "YYYY-MM-DD" (comparable lexicographiquement). */
  date: string;
  /** Heure "HH:mm", absente si non planifiee. */
  heure?: string;
  /** Jalon en cours sur cet evenement (J-x + severite). */
  jalon?: Jalon;
}

/** Un groupe de la vue liste : une date et ses evenements. */
export interface JourEvenements {
  date: string;
  evenements: Evenement[];
}

/** Prochains evenements a venir (hors annules), tries par date croissante. */
export function prochainsEvenements(
  evenements: Evenement[],
  aujourdhuiISO: string,
  n: number,
): Evenement[] {
  return evenements
    .filter((e) => e.date >= aujourdhuiISO && e.statut !== "annulee")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, n);
}

/** Regroupe les evenements par jour, dates triees croissantes. */
export function grouperParJour(evenements: Evenement[]): JourEvenements[] {
  return [...indexerParDate(evenements).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, evs]) => ({ date, evenements: evs }));
}

/** Index date ISO -> evenements, pour lookup O(1) cote vues. */
export function indexerParDate(evenements: Evenement[]): Map<string, Evenement[]> {
  const m = new Map<string, Evenement[]>();
  for (const e of evenements) {
    const liste = m.get(e.date);
    if (liste) liste.push(e);
    else m.set(e.date, [e]);
  }
  return m;
}
