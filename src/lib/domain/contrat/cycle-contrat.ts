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

/** Le dernier cycle enregistre par l'intranet, tel que le suivi le porte. */
export interface DernierCycle {
  debutISO: string;
  /** Fin stockee (duree libre), sinon absente = debut + 1 an - 1 jour. */
  finISO?: string | null;
  /** Jour ou la ligne a ete enregistree (created_at). */
  enregistreLeISO?: string | null;
}

/**
 * La reprise du suivi des contrats (22/07/2026, liste SharePoint MYTHEC) a pose sur TOUTES
 * les copros un cycle date du 01/10/2025 : la bascule de la facturation sur Pennylane, pas
 * un mandat. Cette ligne dit les honoraires en vigueur a la reprise, elle ne dit rien de la
 * date du mandat. Pour 34 GAUTHEY (mandat fini le 30/10/2025, aucune AG depuis la reprise)
 * elle faisait afficher « jusqu'au 30/09/2026 » et taisait 320 jours sans mandat
 * (Sekou, 15/09/2026).
 */
export const BASCULE_SUIVI_CONTRATS = { debutISO: "2025-10-01", enregistreLeISO: "2026-07-22" } as const;

export function estCycleDeBascule(cycle: DernierCycle): boolean {
  return (
    cycle.debutISO === BASCULE_SUIVI_CONTRATS.debutISO &&
    (cycle.enregistreLeISO ?? null) === BASCULE_SUIVI_CONTRATS.enregistreLeISO
  );
}

function finDuCycle(cycle: DernierCycle): string {
  return cycle.finISO && JOUR_RE.test(cycle.finISO) ? cycle.finISO : finDeCycle(cycle.debutISO);
}

function lendemain(iso: string): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return toISO(d);
}

function jourFr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Fin du contrat que l'AG renouvelle : le contrat PRECEDENT, tel qu'on le connaissait AVANT
 * l'assemblee.
 *
 * L'INCIDENT (Villa La Croix S111, Fanny le 03/10/2026 ; meme cas sur S065) : le recap de
 * l'AG du 29/09 avait enregistre le nouveau cycle 01/10/2026 -> 30/09/2027. Regenerer le
 * contrat partait de la fin du DERNIER cycle connu, c'est-a-dire de lui-meme, et proposait
 * un debut au 01/10/2027 : un an de trop.
 *
 * On ecarte donc tout cycle enregistre le jour de l'AG ou apres : c'est ce que l'AG a vote
 * (ou plus tard). Pas de comparaison des DEBUTS a la date d'AG : un mandat retroactif au 1er
 * du mois commence avant l'AG qui le vote (S029 : AG du 19/10, debut au 01/10). La fin du
 * referentiel App A compte aussi, sauf si elle est celle d'un cycle ecarte (App A mis a jour
 * apres l'AG). Sans date d'AG, tout ce qui est connu compte (= finContratEnCours).
 */
export function finContratAvantAg(
  finReferentielISO: string | null | undefined,
  cycles: readonly DernierCycle[],
  dateAgISO: string | null | undefined,
): string | null {
  const ag = dateAgISO && JOUR_RE.test(dateAgISO) ? dateAgISO : null;
  const valides = cycles.filter((c) => JOUR_RE.test(c.debutISO) && !estCycleDeBascule(c));
  const votesParAg = (c: DernierCycle) => ag !== null && !!c.enregistreLeISO && c.enregistreLeISO.slice(0, 10) >= ag;
  const connus = valides.filter((c) => !votesParAg(c));
  const finsEcartees = new Set(valides.filter(votesParAg).map(finDuCycle));

  const fins = connus.map(finDuCycle);
  if (finReferentielISO && JOUR_RE.test(finReferentielISO) && !finsEcartees.has(finReferentielISO)) {
    fins.push(finReferentielISO);
  }
  return fins.length > 0 ? fins.reduce((a, b) => (b > a ? b : a)) : null;
}

/**
 * Le debut saisi laisse-t-il un trou apres le contrat precedent ? Rend le message, ou null.
 * Alerte, jamais un refus (Sekou, 21/10/2026) : une reprise apres une periode sans syndic
 * commence legitimement plus tard. Un debut AVANT le lendemain (renouvellement anticipe)
 * n'alerte pas.
 */
export function alerteDebutApresContratPrecedent(debutISO: string, finPrecedenteISO: string | null): string | null {
  if (!finPrecedenteISO || !JOUR_RE.test(debutISO) || !JOUR_RE.test(finPrecedenteISO)) return null;
  const attendu = lendemain(finPrecedenteISO);
  if (debutISO <= attendu) return null;
  return (
    `le contrat précédent finit le ${jourFr(finPrecedenteISO)} : le nouveau devrait prendre effet le ` +
    `${jourFr(attendu)}, pas le ${jourFr(debutISO)}. À vérifier avant d'éditer.`
  );
}

/** Au-dela, une date d'AG est suspecte (meme seuil que le recap AG, REA-166). */
export const ANCIENNETE_AG_SUSPECTE_MOIS = 6;

/**
 * Date d'AG trop ancienne : c'est le pre-remplissage perime qui a fait editer trois contrats
 * de S111 avec une AG du 24/06/2025, donc au bareme 2025 (29/09/2026). Rend le message, ou null.
 */
export function alerteAgAncienne(dateAgISO: string, aujourdhuiISO: string): string | null {
  if (!JOUR_RE.test(dateAgISO) || !JOUR_RE.test(aujourdhuiISO)) return null;
  const seuil = finDeCycle(dateAgISO, ANCIENNETE_AG_SUSPECTE_MOIS); // AG + 6 mois - 1 jour
  if (seuil >= aujourdhuiISO) return null;
  return (
    `l'assemblée du ${jourFr(dateAgISO)} date de plus de ${ANCIENNETE_AG_SUSPECTE_MOIS} mois : ` +
    `le barème appliqué sera celui de ${dateAgISO.slice(0, 4)}. Vérifier la date.`
  );
}

/** Ce qu'il faut savoir des contrats passes pour controler les dates d'un nouveau contrat. */
export interface ReperesDatesContrat {
  /** Fin du mandat au referentiel App A (`syndicContractEndDate`). */
  finReferentielISO: string | null;
  /** Tous les cycles enregistres par l'intranet. */
  cycles: DernierCycle[];
}

/**
 * Les alertes de dates d'un contrat a editer (garde-fou du 21/10/2026). Pure : le formulaire
 * l'appelle a chaque saisie, le serveur a l'edition pour en garder la trace. N'empeche rien.
 */
export function alertesDatesContrat(
  saisie: { dateAgISO: string; debutISO: string },
  reperes: ReperesDatesContrat,
  aujourdhuiISO: string,
): string[] {
  const finPrecedente = finContratAvantAg(reperes.finReferentielISO, reperes.cycles, saisie.dateAgISO);
  return [
    alerteDebutApresContratPrecedent(saisie.debutISO, finPrecedente),
    alerteAgAncienne(saisie.dateAgISO, aujourdhuiISO),
  ].filter((a): a is string => a !== null);
}

/**
 * Fin du contrat REELLEMENT en cours : la plus tardive entre la date du referentiel App A
 * (`syndicContractEndDate`) et la fin du dernier cycle enregistre par l'intranet.
 *
 * POURQUOI LES DEUX (constat Sekou, 2026-09-11 sur FOCH31 : « il n'est pas echu, nous
 * avons signe le contrat ») : App A n'est PAS mis a jour quand un contrat est renouvele.
 * FOCH31 y porte encore une fin au 30/06/2026 alors que l'intranet a enregistre un cycle
 * demarre le 01/07/2026. Se fier au seul referentiel affichait « echu depuis 73 jours »
 * des contrats signes - et faisait calculer le cycle suivant un an trop tot.
 *
 * Un renouvellement peut commencer AVANT la fin qu'App A connait (mandat renouvele avant
 * terme : BARRILLET1, fin App A au 30/06/2026, nouveau contrat au 01/01/2026) : on ne
 * compare donc pas les debuts, on prend la fin la plus tardive. Seul le cycle de bascule
 * (cf. BASCULE_SUIVI_CONTRATS) est ignore.
 */
export function finContratEnCours(
  finReferentielISO: string | null | undefined,
  dernierCycle: DernierCycle | null | undefined,
): string | null {
  const finRef = finReferentielISO && JOUR_RE.test(finReferentielISO) ? finReferentielISO : null;
  const cycle = dernierCycle && JOUR_RE.test(dernierCycle.debutISO) && !estCycleDeBascule(dernierCycle) ? dernierCycle : null;
  if (!cycle) return finRef;

  // La fin STOCKEE du cycle prime (contrats a duree libre) ; a defaut, l'ancienne
  // regle du debut + 1 an, qui reste vraie pour tout ce qui a ete enregistre avant.
  const finIntranet =
    cycle.finISO && JOUR_RE.test(cycle.finISO) ? cycle.finISO : finDeCycle(cycle.debutISO);
  return finRef && finRef > finIntranet ? finRef : finIntranet;
}
