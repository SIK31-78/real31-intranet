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

/** Durees de contrat proposees au gestionnaire, en mois. La premiere est la regle. */
export const DUREES_CONTRAT_MOIS = [
  { mois: 12, libelle: "1 an" },
  { mois: 24, libelle: "2 ans" },
  { mois: 15, libelle: "15 mois", aide: "reprise : jusqu'a la fin de l'exercice suivant" },
] as const;

/** Un mandat de syndic ne peut exceder trois ans (decret du 17 mars 1967, art. 28). */
export const DUREE_MAX_CONTRAT_MOIS = 36;

/**
 * Fin d'un cycle a partir de son DEBUT et de sa duree : debut + `mois` - 1 jour.
 * A 12 mois c'est l'exact inverse de `cycleSuivant` (verifie par test). Sert a dater
 * la fin d'un contrat dont on ne connait que le debut (cycles enregistres avant que
 * la fin soit stockee) et a proposer une fin quand le gestionnaire choisit une duree.
 *
 * Un jour qui n'existe pas dans le mois d'arrivee (31 + 1 mois, 29/02 hors bissextile)
 * est ramene au dernier jour du mois, jamais reporte au mois suivant.
 */
export function finDeCycle(debutISO: string, mois = 12): string {
  if (!JOUR_RE.test(debutISO)) {
    throw new Error(`Cycle de contrat : date de debut illisible ("${debutISO}").`);
  }
  const d = parseISO(debutISO);
  const jourInitial = d.getUTCDate();
  const moisCible = (d.getUTCMonth() + mois) % 12;
  d.setUTCMonth(d.getUTCMonth() + mois);
  if (d.getUTCMonth() !== moisCible || d.getUTCDate() !== jourInitial) d.setUTCDate(0);
  d.setUTCDate(d.getUTCDate() - 1);
  return toISO(d);
}

/**
 * Le cycle propose est-il acceptable ? Renvoie le motif du refus, ou null.
 * Regles : fin apres le debut, et jamais plus de trois ans (le maximum legal d'un
 * mandat de syndic).
 */
export function motifRefusCycle(debutISO: string, finISO: string): string | null {
  if (!JOUR_RE.test(debutISO) || !JOUR_RE.test(finISO)) return "dates illisibles";
  if (finISO <= debutISO) return "la fin doit être après le début";
  if (finISO > finDeCycle(debutISO, DUREE_MAX_CONTRAT_MOIS)) {
    return "un mandat de syndic ne peut pas dépasser trois ans";
  }
  return null;
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
 * `debutDernierCycle` : `intranet_suivi_contrats.debut_contrat` le plus recent, ou null ;
 * `finDernierCycle` : sa `fin_contrat` si elle est renseignee (duree libre).
 */
export function finContratEnCours(
  finReferentielISO: string | null | undefined,
  debutDernierCycleISO: string | null | undefined,
  finDernierCycleISO?: string | null,
): string | null {
  const finRef = finReferentielISO && JOUR_RE.test(finReferentielISO) ? finReferentielISO : null;
  const debutCycle = debutDernierCycleISO && JOUR_RE.test(debutDernierCycleISO) ? debutDernierCycleISO : null;
  if (!debutCycle) return finRef;

  // Un cycle intranet ne compte que s'il COMMENCE APRES la fin du referentiel : c'est
  // alors un renouvellement qu'App A ignore. Un cycle qui commence avant n'apprend rien
  // de plus qu'App A - et peut meme le masquer : la reprise du suivi (22/07/2026) a pose
  // un cycle au 01/10/2025 sur toutes les copros ; pour 34 GAUTHEY (mandat fini le
  // 30/10/2025, aucune AG depuis la reprise), il faisait afficher « jusqu'au 30/09/2026 »
  // et taisait 320 jours sans mandat (Sekou, 15/09/2026).
  if (finRef && debutCycle <= finRef) return finRef;

  // La fin STOCKEE du cycle prime (contrats a duree libre) ; a defaut, l'ancienne
  // regle du debut + 1 an, qui reste vraie pour tout ce qui a ete enregistre avant.
  return finDernierCycleISO && JOUR_RE.test(finDernierCycleISO)
    ? finDernierCycleISO
    : finDeCycle(debutCycle);
}
