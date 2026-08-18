// Domaine PUR du CONTROLE PAR COMPTE (aucune I/O). Complement de l'auto-check global
// (equilibre debit==credit) : quand la source imprime, pour un compte, ses TOTAUX (total
// debit / total credit), on verifie que la somme des ecritures qu'on a extraites pour CE
// compte retombe bien sur ces totaux. C'est un filet LOCAL : l'equilibre global peut tomber
// a 0 par compensation entre comptes ; le controle par compte, lui, localise precisement
// quel compte a une somme d'ecritures fausse.
//
// Un compte SANS total imprime n'est pas une erreur : il est simplement NON CONTROLE (on ne
// dispose d'aucune reference pour lui). On ne signale que les comptes reellement en ecart.

import { SEUIL_EQUILIBRE, classeDe } from "@/lib/reprise/domain/compta";
import type { ControleCompte, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import { plageDatesEcritures } from "@/lib/reprise/domain/ecriture";

/** Verdict de controle d'UN compte (somme des ecritures vs total imprime). */
export interface EcartCompte {
  compte: string;
  /** Somme des debits des ecritures extraites pour ce compte. */
  debitCalcule: number;
  /** Somme des credits des ecritures extraites pour ce compte. */
  creditCalcule: number;
  /** Total debit imprime par la source (si publie). */
  debitImprime?: number;
  /** Total credit imprime par la source (si publie). */
  creditImprime?: number;
  /** Report a-nouveau debit capture pour ce compte (0 si aucun). */
  reportDebit: number;
  /** Report a-nouveau credit capture pour ce compte (0 si aucun). */
  reportCredit: number;
  /**
   * Ecart signe cote debit = (report + calcule) - imprime (undefined si pas de total debit
   * imprime). Le total imprime INCLUT le report a-nouveau, que l'on n'extrait pas en ecritures.
   */
  ecartDebit?: number;
  /** Ecart signe cote credit = (report + calcule) - imprime (undefined si pas de total credit imprime). */
  ecartCredit?: number;
}

/** Resultat d'ensemble : la liste des comptes EN ECART + des agregats pour l'humain. */
export interface ResultatControleComptes {
  /** Uniquement les comptes dont un ecart depasse le seuil d'arrondi. */
  enEcart: EcartCompte[];
  /** Nombre de comptes reellement controles (au moins un total imprime disponible). */
  nbComptesControles: number;
  /** Nombre de comptes en ecart (= enEcart.length). */
  nbEnEcart: number;
}

/** Arrondi au centime (evite le bruit flottant sur les cumuls). */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Classe comptable tolerante (ne leve pas : renvoie null si hors 1..7 ou non numerique). */
function classeSafe(compte: string): number | null {
  try {
    return classeDe(compte);
  } catch {
    return null;
  }
}

// --- Garde-fou "grand livre AVANT repartition" (signature comptable) ---------------
//
// La comptable a un cas reel : l'ancien syndic transmet parfois le grand livre AVANT la
// repartition de l'exercice cloture. Signature comptable : les comptes de CHARGES (classe 6)
// et de PRODUITS (classe 7) portent un report a-nouveau / solde anterieur NON NUL alors qu'apres
// cloture+repartition ils DOIVENT repartir a ZERO (ils sont soldes par la repartition). Un
// report non nul sur un compte de classe 6/7 est donc l'indice que le grand livre n'est pas le
// bon -> aucune reprise fiable n'est possible, il faut redemander le grand livre APRES regule.
//
// A l'inverse, un report sur un compte de classe 4/5 (tiers, tresorerie) est NORMAL (les soldes
// des coproprietaires, fournisseurs, banques se reportent d'un exercice a l'autre) : on ne
// signale QUE les classes 6 et 7. PUR, deterministe, PII-free (numeros + montants seulement).

/** Un compte de classe 6/7 porteur d'un report a-nouveau non nul (indice avant-repartition). */
export interface CompteAvantRepartition {
  /** Numero de compte source (PII-free). */
  compte: string;
  /** Report a-nouveau debit capture (arrondi ; 0 si aucun). */
  reportDebit: number;
  /** Report a-nouveau credit capture (arrondi ; 0 si aucun). */
  reportCredit: number;
}

/** Verdict du garde-fou avant-repartition. */
export interface VerdictAvantRepartition {
  /** true si au moins un compte de classe 6/7 porte un report non nul (bloquant strict). */
  avantRepartition: boolean;
  /** Comptes concernes (tries par numero), vide si le grand livre est bien post-repartition. */
  comptes: CompteAvantRepartition[];
  /**
   * Preuve ARITHMETIQUE qui degrade le blocage en avertissement (regle Sekou 2026-08-18) :
   * l'extraction reproduit au centime une balance independante a la date de bascule.
   * Posee par le service quand la preuve est fournie ET reproduite ; portee PAR le verdict
   * pour survivre au rejeu cote client (appliquerDecisions). Absente = blocage strict.
   */
  degradeParPreuve?: VerdictPreuveBascule;
}

/**
 * Detecte la signature "grand livre AVANT repartition" : un compte de classe 6 (charges) ou 7
 * (produits) portant un report a-nouveau (reportDebit/reportCredit) au-dela du seuil d'arrondi.
 * Les reports sont captures dans les ControleCompte (remplis par le parseur couche texte). Pur.
 */
export function detecterAvantRepartition(controles: ControleCompte[]): VerdictAvantRepartition {
  const comptes: CompteAvantRepartition[] = [];
  for (const c of controles) {
    const classe = classeSafe(c.compte);
    if (classe !== 6 && classe !== 7) continue;
    const reportDebit = arrondi(c.reportDebit ?? 0);
    const reportCredit = arrondi(c.reportCredit ?? 0);
    if (Math.abs(reportDebit) >= SEUIL_EQUILIBRE || Math.abs(reportCredit) >= SEUIL_EQUILIBRE) {
      comptes.push({ compte: c.compte, reportDebit, reportCredit });
    }
  }
  comptes.sort((a, b) => a.compte.localeCompare(b.compte));
  return { avantRepartition: comptes.length > 0, comptes };
}

/**
 * Message BLOQUANT (PII-free : numeros + montants, jamais de libelle) explicitant le verdict
 * avant-repartition. Reutilise par le plan de mapping (erreur) et l'ecran de revue.
 */
export function messageAvantRepartition(verdict: VerdictAvantRepartition): string {
  const liste = verdict.comptes
    .map((c) => {
      const parts: string[] = [];
      if (Math.abs(c.reportDebit) >= SEUIL_EQUILIBRE) parts.push(`report D ${c.reportDebit}`);
      if (Math.abs(c.reportCredit) >= SEUIL_EQUILIBRE) parts.push(`report C ${c.reportCredit}`);
      return `${c.compte} (${parts.join(", ")})`;
    })
    .join(" ; ");
  return (
    `Ce grand livre semble etre la version AVANT repartition : ${verdict.comptes.length} compte(s) de ` +
    `classe 6/7 avec un solde anterieur non nul (${liste}). Apres cloture+repartition ces comptes ` +
    `repartent a zero. Demander a l'ancien syndic le grand livre APRES repartition/regule avant toute reprise.`
  );
}

/**
 * Confronte les ecritures extraites aux totaux imprimes par compte. Pour chaque ControleCompte
 * porteur d'au moins un total, on cumule les debits/credits des ecritures du meme compte, on y
 * REINTEGRE le report a-nouveau capture (le total imprime l'inclut, alors qu'on n'extrait pas
 * les reports en ecritures), et on compare : report + somme(ecritures) == total imprime. Un
 * compte est "en ecart" si |report + calcule - imprime| depasse SEUIL_EQUILIBRE cote debit OU
 * cote credit. PUR, deterministe.
 */
export function verifierTotauxParCompte(
  lignes: LigneEcriture[],
  controles: ControleCompte[],
): ResultatControleComptes {
  // Cumul des ecritures par compte (une seule passe).
  const parCompte = new Map<string, { debit: number; credit: number }>();
  for (const l of lignes) {
    const agg = parCompte.get(l.compte) ?? { debit: 0, credit: 0 };
    if (l.sens === "debit") agg.debit += l.montant;
    else agg.credit += l.montant;
    parCompte.set(l.compte, agg);
  }

  const enEcart: EcartCompte[] = [];
  let nbComptesControles = 0;

  for (const c of controles) {
    const aDebit = typeof c.totalDebit === "number";
    const aCredit = typeof c.totalCredit === "number";
    if (!aDebit && !aCredit) continue; // rien a comparer -> compte non controle
    nbComptesControles++;

    const agg = parCompte.get(c.compte) ?? { debit: 0, credit: 0 };
    const debitCalcule = arrondi(agg.debit);
    const creditCalcule = arrondi(agg.credit);
    // Le total imprime INCLUT le report a-nouveau (solde d'ouverture), or on ne reprend PAS les
    // reports comme ecritures -> on les reintegre ici : report + somme(ecritures) == total.
    const reportDebit = arrondi(c.reportDebit ?? 0);
    const reportCredit = arrondi(c.reportCredit ?? 0);
    const ecartDebit = aDebit ? arrondi(reportDebit + debitCalcule - (c.totalDebit as number)) : undefined;
    const ecartCredit = aCredit ? arrondi(reportCredit + creditCalcule - (c.totalCredit as number)) : undefined;

    const enEcartDebit = ecartDebit !== undefined && Math.abs(ecartDebit) >= SEUIL_EQUILIBRE;
    const enEcartCredit = ecartCredit !== undefined && Math.abs(ecartCredit) >= SEUIL_EQUILIBRE;
    if (enEcartDebit || enEcartCredit) {
      enEcart.push({
        compte: c.compte,
        debitCalcule,
        creditCalcule,
        debitImprime: c.totalDebit,
        creditImprime: c.totalCredit,
        reportDebit,
        reportCredit,
        ecartDebit,
        ecartCredit,
      });
    }
  }

  return { enEcart, nbComptesControles, nbEnEcart: enEcart.length };
}

/**
 * Ligne de la BALANCE PAR COMPTE presentee a la comptable : sa verification metier porte sur
 * la balance de chaque compte (pas sur chaque ecriture - regle REAL31). `statut` :
 * "ok" = controle et reconcilie au centime ; "ecart" = controle et faux (a investiguer) ;
 * "non_controle" = la source n'imprime aucun total pour ce compte (rien a comparer).
 */
export interface LigneBalanceCompte {
  compte: string;
  intitule?: string;
  reportDebit: number;
  reportCredit: number;
  debitCalcule: number;
  creditCalcule: number;
  debitImprime?: number;
  creditImprime?: number;
  ecartDebit?: number;
  ecartCredit?: number;
  /** Solde des ecritures extraites (report inclus) : debit - credit. */
  solde: number;
  statut: "ok" | "ecart" | "non_controle";
}

/**
 * Construit la balance complete par compte (TOUS les comptes ayant des ecritures ou un total
 * imprime), triee par numero de compte. C'est l'artefact de verification de la comptable :
 * elle valide la balance de chaque compte, pas les lignes une a une. PUR, deterministe.
 */
export function balanceParCompte(
  lignes: LigneEcriture[],
  controles: ControleCompte[],
  intitules?: Record<string, string>,
): LigneBalanceCompte[] {
  const parCompte = new Map<string, { debit: number; credit: number }>();
  for (const l of lignes) {
    const agg = parCompte.get(l.compte) ?? { debit: 0, credit: 0 };
    if (l.sens === "debit") agg.debit += l.montant;
    else agg.credit += l.montant;
    parCompte.set(l.compte, agg);
  }
  const controleParCompte = new Map(controles.map((c) => [c.compte, c]));
  const tousComptes = new Set<string>([...parCompte.keys(), ...controleParCompte.keys()]);

  const balance: LigneBalanceCompte[] = [];
  for (const compte of tousComptes) {
    const agg = parCompte.get(compte) ?? { debit: 0, credit: 0 };
    const c = controleParCompte.get(compte);
    const debitCalcule = arrondi(agg.debit);
    const creditCalcule = arrondi(agg.credit);
    const reportDebit = arrondi(c?.reportDebit ?? 0);
    const reportCredit = arrondi(c?.reportCredit ?? 0);
    const aDebit = typeof c?.totalDebit === "number";
    const aCredit = typeof c?.totalCredit === "number";
    const ecartDebit = aDebit ? arrondi(reportDebit + debitCalcule - (c!.totalDebit as number)) : undefined;
    const ecartCredit = aCredit ? arrondi(reportCredit + creditCalcule - (c!.totalCredit as number)) : undefined;
    const enEcart =
      (ecartDebit !== undefined && Math.abs(ecartDebit) >= SEUIL_EQUILIBRE) ||
      (ecartCredit !== undefined && Math.abs(ecartCredit) >= SEUIL_EQUILIBRE);
    balance.push({
      compte,
      ...(intitules?.[compte] ? { intitule: intitules[compte] } : {}),
      reportDebit,
      reportCredit,
      debitCalcule,
      creditCalcule,
      debitImprime: c?.totalDebit,
      creditImprime: c?.totalCredit,
      ecartDebit,
      ecartCredit,
      solde: arrondi(reportDebit + debitCalcule - reportCredit - creditCalcule),
      statut: !aDebit && !aCredit ? "non_controle" : enEcart ? "ecart" : "ok",
    });
  }
  balance.sort((a, b) => a.compte.localeCompare(b.compte));
  return balance;
}

// --- LE CONTROLE CROISE : raccordement des DEUX exercices (le joyau) ---------------
//
// Une reprise de copro recoit SYSTEMATIQUEMENT deux grands livres :
//   1. l'exercice CLOTURE (N-1, apres approbation + repartition) ;
//   2. l'exercice EN COURS (du 1er jour de l'exercice courant jusqu'a la fin de contrat du
//      syndic sortant).
// Regle comptable non negociable : les REPORTS a-nouveau (soldes d'ouverture) du grand livre EN
// COURS doivent etre EXACTEMENT egaux, compte par compte, aux SOLDES FINAUX du grand livre
// CLOTURE (report + ecritures, signe debit-credit). S'ils ne se raccordent pas au centime, l'un
// des deux documents est faux. Filet deterministe que personne ne fait a la main.
//
// PII-free : ne manipule QUE des numeros de compte et des montants (jamais de libelle).

/** Un compte dont le solde de cloture et le report en cours ne coincident pas au centime. */
export interface EcartRaccordement {
  /** Numero de compte source (PII-free). */
  compte: string;
  /** Solde FINAL du grand livre cloture = report + ecritures (signe debit - credit). */
  soldeCloture: number;
  /** Report a-nouveau (solde d'ouverture) du grand livre en cours (signe debit - credit). */
  reportEnCours: number;
  /** Ecart signe = soldeCloture - reportEnCours (0 si raccorde). */
  ecart: number;
}

/** Un compte present d'UN seul cote avec un montant non nul (pas de vis-a-vis pour raccorder). */
export interface CompteSansVisAVis {
  /** Numero de compte source (PII-free). */
  compte: string;
  /** Cote ou le compte porte un montant non nul mais sans contrepartie sur l'autre grand livre. */
  cote: "cloture" | "en_cours";
  /** Montant present du cote concerne (solde de cloture ou report en cours, signe). */
  montant: number;
}

/** Verdict du controle croise cloture <-> en cours. */
export interface VerdictRaccordement {
  /** true si aucun ecart ET aucun compte sans vis-a-vis (les deux exercices se raccordent). */
  raccorde: boolean;
  /** Nombre de comptes confrontes qui se raccordent au centime. */
  nbComptesRaccordes: number;
  /** Comptes dont le solde de cloture et le report en cours divergent (tries par numero). */
  ecarts: EcartRaccordement[];
  /** Comptes a solde/report non nul presents d'un seul cote (tries par numero). */
  comptesSansVisAVis: CompteSansVisAVis[];
}

/** Jeu minimal necessaire au raccordement (ecritures + reports captures). */
interface GrandLivrePourRaccord {
  lignes: LigneEcriture[];
  controles?: ControleCompte[];
}

/**
 * LE CONTROLE CROISE. Confronte, compte par compte, le SOLDE FINAL du grand livre CLOTURE (report
 * + ecritures) au REPORT a-nouveau du grand livre EN COURS. Tolerance = SEUIL_EQUILIBRE.
 *   - present des deux cotes : ecart = soldeCloture - reportEnCours ; au-dela du seuil -> ecart ;
 *   - present d'un seul cote avec un montant non nul -> comptesSansVisAVis (un solde qui devait se
 *     reporter mais n'a pas de contrepartie, ou un report surgi de nulle part) ;
 *   - present d'un seul cote a montant nul (compte 6/7 soldé par la repartition) -> ignore (raccorde
 *     trivialement). PUR, deterministe.
 */
export function raccorderExercices(
  cloture: GrandLivrePourRaccord,
  enCours: GrandLivrePourRaccord,
): VerdictRaccordement {
  // Soldes finaux du cloture (report + ecritures) via la balance par compte (report inclus).
  const soldesCloture = new Map<string, number>();
  for (const l of balanceParCompte(cloture.lignes, cloture.controles ?? [])) {
    soldesCloture.set(l.compte, l.solde);
  }
  // Reports a-nouveau de l'en cours (solde d'ouverture signe) captures dans les ControleCompte.
  const reportsEnCours = new Map<string, number>();
  for (const c of enCours.controles ?? []) {
    reportsEnCours.set(c.compte, arrondi((c.reportDebit ?? 0) - (c.reportCredit ?? 0)));
  }

  const comptes = new Set<string>([...soldesCloture.keys(), ...reportsEnCours.keys()]);
  const ecarts: EcartRaccordement[] = [];
  const comptesSansVisAVis: CompteSansVisAVis[] = [];
  let nbComptesRaccordes = 0;

  for (const compte of comptes) {
    const aCloture = soldesCloture.has(compte);
    const aEnCours = reportsEnCours.has(compte);
    const soldeCloture = soldesCloture.get(compte) ?? 0;
    const reportEnCours = reportsEnCours.get(compte) ?? 0;

    if (aCloture && aEnCours) {
      const ecart = arrondi(soldeCloture - reportEnCours);
      if (Math.abs(ecart) >= SEUIL_EQUILIBRE) {
        ecarts.push({ compte, soldeCloture, reportEnCours, ecart });
      } else {
        nbComptesRaccordes++;
      }
    } else {
      // Present d'un seul cote : seul un montant non nul est une anomalie (0 = soldé, raccorde).
      const montant = aCloture ? soldeCloture : reportEnCours;
      if (Math.abs(montant) >= SEUIL_EQUILIBRE) {
        comptesSansVisAVis.push({ compte, cote: aCloture ? "cloture" : "en_cours", montant });
      } else {
        nbComptesRaccordes++;
      }
    }
  }

  ecarts.sort((a, b) => a.compte.localeCompare(b.compte));
  comptesSansVisAVis.sort((a, b) => a.compte.localeCompare(b.compte));
  return {
    raccorde: ecarts.length === 0 && comptesSansVisAVis.length === 0,
    nbComptesRaccordes,
    ecarts,
    comptesSansVisAVis,
  };
}

/**
 * Message BLOQUANT (PII-free : numeros + montants) explicitant un raccordement KO. Reutilise par
 * le plan de mapping (erreur) et par le recap. Le mot "ecart" chiffre garantit un classement en
 * anomalie/erreur cote systeme de notes.
 */
export function messageRaccordement(verdict: VerdictRaccordement): string {
  if (verdict.raccorde) return "Les deux grands livres se raccordent au centime.";
  // NB : on ecrit "n°<compte>" (et non "compte <compte>") pour ne pas declencher l'heuristique de
  // source "liaison" du classement de notes (motif "compte 450...") : un raccordement est une note
  // de source COMPTA. Le mot "ecart" chiffre garantit le niveau anomalie/erreur.
  const bouts: string[] = [];
  for (const e of verdict.ecarts.slice(0, 8)) {
    bouts.push(`n°${e.compte} : solde cloture ${e.soldeCloture} vs report en cours ${e.reportEnCours} (ecart ${e.ecart})`);
  }
  for (const c of verdict.comptesSansVisAVis.slice(0, 8)) {
    bouts.push(`n°${c.compte} : ${c.montant} cote ${c.cote} sans vis-a-vis (ecart ${c.montant})`);
  }
  const reste =
    verdict.ecarts.length + verdict.comptesSansVisAVis.length - Math.min(verdict.ecarts.length, 8) - Math.min(verdict.comptesSansVisAVis.length, 8);
  const suffixe = reste > 0 ? ` ; +${reste} autre(s)` : "";
  return (
    `Les deux grands livres ne se raccordent pas au centime : ${verdict.ecarts.length} ecart(s) et ` +
    `${verdict.comptesSansVisAVis.length} compte(s) sans vis-a-vis. Les a-nouveaux de l'exercice EN COURS ` +
    `doivent egaler les soldes finaux de l'exercice CLOTURE. ${bouts.join(" ; ")}${suffixe}. ` +
    `L'un des deux grands livres est faux : le raccordement est impossible en l'etat.`
  );
}

// --- Classement CLOTURE vs EN COURS par plage de dates -----------------------------
//
// Detection ROBUSTE par le CONTENU (pas par le nom de fichier) : le grand livre CLOTURE couvre
// l'exercice N-1 (dates plus anciennes), l'EN COURS couvre l'exercice courant (dates plus
// recentes). On classe les deux jeux extraits par leur plage de dates : le plus ancien = cloture,
// le plus recent = en cours. Un chevauchement des plages est une anomalie de coherence (signalee,
// non bloquante : on garde le meilleur classement possible). PUR.

/** Deux jeux d'ecritures classes par exercice + drapeau de chevauchement. */
export interface ClassementExercices<T> {
  cloture: T;
  enCours: T;
  /** true si la plage du cloture deborde sur celle de l'en cours (max cloture > min en cours). */
  chevauchement: boolean;
  /** true si aucune date exploitable des deux cotes (classement par ordre d'entree, peu fiable). */
  datesIndisponibles: boolean;
}

/**
 * Classe deux jeux d'ecritures en {cloture, enCours} par leur plage de dates (le plus ancien =
 * cloture). Compare d'abord la date de fin (max) puis, a defaut, la date de debut (min). Si aucune
 * date n'est exploitable, conserve l'ordre d'entree (a=cloture) et leve datesIndisponibles. PUR.
 */
export function classerParExercice<T extends { lignes: LigneEcriture[] }>(
  a: T,
  b: T,
): ClassementExercices<T> {
  const pa = plageDatesEcritures(a.lignes);
  const pb = plageDatesEcritures(b.lignes);
  const cleA = pa.max ?? pa.min;
  const cleB = pb.max ?? pb.min;
  const datesIndisponibles = cleA === undefined && cleB === undefined;

  // Le plus ANCIEN (cle la plus petite) est la cloture. Dates absentes -> pousse en dernier (en
  // cours par defaut), l'autre devient cloture ; les deux absentes -> ordre d'entree.
  let clotureEstA: boolean;
  if (cleA === undefined && cleB === undefined) clotureEstA = true;
  else if (cleA === undefined) clotureEstA = false;
  else if (cleB === undefined) clotureEstA = true;
  else clotureEstA = cleA <= cleB;

  const cloture = clotureEstA ? a : b;
  const enCours = clotureEstA ? b : a;
  const plageCloture = clotureEstA ? pa : pb;
  const plageEnCours = clotureEstA ? pb : pa;

  const chevauchement =
    plageCloture.max !== undefined && plageEnCours.min !== undefined && plageCloture.max > plageEnCours.min;

  return { cloture, enCours, chevauchement, datesIndisponibles };
}

// --- Preuve par la balance de bascule (degradation ARITHMETIQUE du garde-fou) --------------
//
// Regle Sekou 2026-08-18 : reports 6/7 non nuls -> BLOCAGE, SAUF si une balance INDEPENDANTE
// a la date de bascule est fournie ET que l'extraction la reproduit au centime. Dans ce cas :
// avertissement, jamais silence, avec mention explicite de ce sur quoi la degradation
// s'appuie. Le declencheur est ARITHMETIQUE, jamais un libelle ("Cloture 2025" est du texte
// libre propre a un syndic - le type de motif fragile banni partout ailleurs). Ce que le
// garde-fou cherche vraiment a savoir n'est pas "la cloture a-t-elle ete passee" mais "les
// soldes 450 sont-ils fiables" - et de ca, la balance reproduite est une preuve.
//
// Garde supplementaire : la balance servant de preuve doit elle-meme etre POST-repartition,
// sinon on prouve la coherence avec un document faux. Recoupement : classe 6 de la balance
// == total general du RGD de l'exercice (au centime). Optionnel (RGD non fourni -> non
// verifie, DIT explicitement).

import type { SoldeCompte } from "@/lib/reprise/domain/compta";

/** Un ecart de confrontation extraction <-> balance (PII-free : numeros et montants). */
export interface EcartBascule {
  compte: string;
  /** Solde de la balance (debit - credit). */
  attendu: number;
  /** Solde reconstitue de l'extraction (reports + mouvements). */
  obtenu: number;
}

export interface VerdictPreuveBascule {
  /** true si TOUS les comptes confrontables se reproduisent au centime (et au moins un). */
  reproduite: boolean;
  /** Nombre de comptes confrontes au centime. */
  confrontes: number;
  ecarts: EcartBascule[];
  /** Comptes de la balance introuvables dans l'extraction avec un solde NON nul (info). */
  nonConfrontables: string[];
  /** Date de bascule imprimee sur la balance, si capturee (JJ/MM/AAAA). */
  dateBascule?: string;
  /** true = classe 6 de la balance == total RGD au centime ; absent = non verifie (dit). */
  postRepartitionVerifiee?: boolean;
}

/**
 * Confronte l'extraction du grand livre (mouvements + reports captures) aux SOLDES d'une
 * balance independante a la date de bascule. Par compte feuille de la balance :
 *   solde extrait = (reportDebit - reportCredit) + somme(mouvements debit - credit)
 * doit egaler solde balance = debit - credit, au centime. Un compte de la balance ABSENT de
 * l'extraction n'est confrontable que si son solde est nul (sinon il part en ecart : il
 * manque des donnees a l'extraction). Un compte extrait absent de la balance avec un solde
 * non nul part aussi en ecart. Pur.
 */
export function confronterBalanceBascule(
  lignes: readonly { compte: string; sens: "debit" | "credit"; montant: number }[],
  controles: readonly ControleCompte[],
  soldesBalance: readonly SoldeCompte[],
  dateBascule?: string,
): VerdictPreuveBascule {
  const soldeExtrait = new Map<string, number>();
  const vusExtraction = new Set<string>();
  for (const c of controles) {
    const cle = c.compte.trim();
    vusExtraction.add(cle);
    soldeExtrait.set(cle, arrondi((soldeExtrait.get(cle) ?? 0) + (c.reportDebit ?? 0) - (c.reportCredit ?? 0)));
  }
  for (const l of lignes) {
    const cle = l.compte.trim();
    vusExtraction.add(cle);
    const delta = l.sens === "debit" ? l.montant : -l.montant;
    soldeExtrait.set(cle, arrondi((soldeExtrait.get(cle) ?? 0) + delta));
  }

  const ecarts: EcartBascule[] = [];
  const nonConfrontables: string[] = [];
  let confrontes = 0;
  const vusBalance = new Set<string>();

  for (const s of soldesBalance) {
    const compte = s.nomenclature.trim();
    vusBalance.add(compte);
    const attendu = arrondi(s.debit - s.credit);
    if (!vusExtraction.has(compte)) {
      // Absent de l'extraction : un solde nul peut legitimement ne pas apparaitre au GL ;
      // un solde non nul signifie qu'il MANQUE des donnees -> ecart.
      if (Math.abs(attendu) >= SEUIL_EQUILIBRE) {
        ecarts.push({ compte, attendu, obtenu: 0 });
        nonConfrontables.push(compte);
      }
      continue;
    }
    const obtenu = soldeExtrait.get(compte) ?? 0;
    if (Math.abs(attendu - obtenu) >= SEUIL_EQUILIBRE) ecarts.push({ compte, attendu, obtenu });
    else confrontes += 1;
  }

  // Comptes extraits ABSENTS de la balance avec un solde non nul : la balance est censee
  // etre exhaustive a sa date -> ecart (l'extraction porte quelque chose que la balance nie).
  for (const [compte, solde] of soldeExtrait) {
    if (vusBalance.has(compte)) continue;
    if (Math.abs(solde) >= SEUIL_EQUILIBRE) ecarts.push({ compte, attendu: 0, obtenu: solde });
  }

  ecarts.sort((a, b) => a.compte.localeCompare(b.compte));
  return {
    reproduite: confrontes > 0 && ecarts.length === 0,
    confrontes,
    ecarts,
    nonConfrontables,
    ...(dateBascule ? { dateBascule } : {}),
  };
}

/**
 * La balance de preuve est-elle POST-repartition ? Recoupement : la somme des soldes de
 * classe 6 de la balance doit egaler le total general du RGD de l'exercice, au centime.
 */
export function verifierBalancePostRepartition(
  soldesBalance: readonly SoldeCompte[],
  totalGeneralRgd: number,
): { coherent: boolean; classe6: number; ecart: number } {
  let classe6 = 0;
  for (const s of soldesBalance) if (s.classe === 6) classe6 += s.debit - s.credit;
  classe6 = arrondi(classe6);
  const ecart = arrondi(classe6 - totalGeneralRgd);
  return { coherent: Math.abs(ecart) < SEUIL_EQUILIBRE, classe6, ecart };
}

/** Message d'AVERTISSEMENT quand le blocage avant-repartition est degrade par la preuve. */
export function messageDegradationBascule(
  verdict: VerdictAvantRepartition,
  preuve: VerdictPreuveBascule,
): string {
  const recoupement =
    preuve.postRepartitionVerifiee === true
      ? "classe 6 recoupee par le total du RGD au centime"
      : preuve.postRepartitionVerifiee === false
        ? "ATTENTION : classe 6 NON recoupee par le RGD"
        : "recoupement RGD non effectue (RGD non fourni)";
  return (
    `Reports 6/7 non nuls (${verdict.comptes.length} compte(s)) : blocage DEGRADE en avertissement. ` +
    `Appui : balance de bascule${preuve.dateBascule ? ` du ${preuve.dateBascule}` : ""} reproduite au ` +
    `centime par l'extraction (${preuve.confrontes} comptes confrontes, 0 ecart) ; ${recoupement}. ` +
    `Les soldes importes reproduiront exactement cette balance.`
  );
}
