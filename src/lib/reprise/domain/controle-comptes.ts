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
