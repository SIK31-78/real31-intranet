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

/**
 * Fin d'un cycle a partir de son DEBUT : debut + 1 an - 1 jour. Exact inverse de
 * `cycleSuivant`, qui rend `fin = debut + 1 an - 1 jour` lui aussi (verifie par test).
 * Sert a dater la fin d'un contrat enregistre dans `intranet_suivi_contrats`, qui ne
 * porte que la date de DEBUT.
 */
export function finDeCycle(debutISO: string): string {
  if (!JOUR_RE.test(debutISO)) {
    throw new Error(`Cycle de contrat : date de debut illisible ("${debutISO}").`);
  }
  const d = parseISO(debutISO);
  const jourInitial = d.getUTCDate();
  const moisInitial = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  if (d.getUTCMonth() !== moisInitial || d.getUTCDate() !== jourInitial) d.setUTCDate(0);
  d.setUTCDate(d.getUTCDate() - 1);
  return toISO(d);
}

/**
 * Fin du contrat REELLEMENT en cours : la plus tardive entre la date du referentiel App A
 * (`syndicContractEndDate`) et la fin deduite du dernier cycle enregistre par l'intranet.
 *
 * POURQUOI LES DEUX (constat Sekou, 2026-09-11 sur FOCH31 : « il n'est pas echu, nous
 * avons signe le contrat ») : App A n'est PAS mis a jour quand un contrat est renouvele.
 * FOCH31 y porte encore une fin au 30/06/2026 alors que l'intranet a enregistre un cycle
 * demarre le 01/07/2026. Se fier au seul referentiel affichait « echu depuis 73 jours »
 * des contrats signes - et faisait calculer le cycle suivant un an trop tot.
 *
 * `debutDernierCycle` : `intranet_suivi_contrats.debut_contrat` le plus recent, ou null.
 */
export function finContratEnCours(
  finReferentielISO: string | null | undefined,
  debutDernierCycleISO: string | null | undefined,
): string | null {
  const finIntranet = debutDernierCycleISO ? finDeCycle(debutDernierCycleISO) : null;
  const candidates = [finReferentielISO, finIntranet].filter(
    (d): d is string => Boolean(d) && JOUR_RE.test(d!),
  );
  if (candidates.length === 0) return null;
  return candidates.sort().at(-1)!;
}
