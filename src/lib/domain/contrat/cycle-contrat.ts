// Cycle d'un contrat de syndic : ses dates de debut et de fin.
// Portage du flow PowerApps `[REAL] Generation du contrat de syndic` (MYTHEC).
// Fonctions pures, deterministes, aucune dependance.
//
// LA REGLE, telle qu'elle est dans le legacy :
//   DebutContrat = fin du contrat precedent + 1 JOUR
//   FinContrat   = fin du contrat precedent + 1 AN
// Le nouveau contrat court donc sur ~364 jours, pas 365. Ce n'est PAS un bug
// (MIGRATION_PLAN.md #7, tranche le 2026-07-06) : la regle d'arrondi de
// `calculerDureeContrat` (11 mois et >= 29 jours -> +1 an) rattrape l'ecart, et
// le contrat s'affiche bien « 1 an, 0 mois, 0 jour ». On reproduit a l'identique
// plutot que de « corriger » : le document imprime doit rester le meme.

/** Les deux bornes d'un cycle de contrat, en ISO "YYYY-MM-DD". */
export interface CycleContrat {
  debut: string;
  fin: string;
}

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseISO(iso: string): Date {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Cycle suivant, a partir de la date de fin du contrat en cours.
 * `finPrecedenteISO` : 'YYYY-MM-DD' (cote base, `Copropriete.syndicContractEndDate`).
 *
 * Le 29 fevrier est ramene au 28 quand l'annee d'arrivee n'est pas bissextile :
 * `setUTCFullYear` deborderait sinon sur le 1er mars, et un contrat afficherait une
 * date de fin qui n'est pas celle que le gestionnaire attend.
 */
export function cycleSuivant(finPrecedenteISO: string): CycleContrat {
  if (!JOUR_RE.test(finPrecedenteISO)) {
    throw new Error(`Cycle de contrat : date de fin illisible ("${finPrecedenteISO}").`);
  }
  const finPrec = parseISO(finPrecedenteISO);

  const debut = new Date(finPrec);
  debut.setUTCDate(debut.getUTCDate() + 1);

  const fin = new Date(finPrec);
  const jourInitial = fin.getUTCDate();
  const moisInitial = fin.getUTCMonth();
  fin.setUTCFullYear(fin.getUTCFullYear() + 1);
  // Le 29/02 d'une annee bissextile tombe sur le 01/03 l'annee suivante : on recule.
  if (fin.getUTCMonth() !== moisInitial || fin.getUTCDate() !== jourInitial) {
    fin.setUTCDate(0);
  }

  return { debut: toISO(debut), fin: toISO(fin) };
}
