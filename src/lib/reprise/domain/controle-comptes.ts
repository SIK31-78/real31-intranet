// Domaine PUR du CONTROLE PAR COMPTE (aucune I/O). Complement de l'auto-check global
// (equilibre debit==credit) : quand la source imprime, pour un compte, ses TOTAUX (total
// debit / total credit), on verifie que la somme des ecritures qu'on a extraites pour CE
// compte retombe bien sur ces totaux. C'est un filet LOCAL : l'equilibre global peut tomber
// a 0 par compensation entre comptes ; le controle par compte, lui, localise precisement
// quel compte a une somme d'ecritures fausse.
//
// Un compte SANS total imprime n'est pas une erreur : il est simplement NON CONTROLE (on ne
// dispose d'aucune reference pour lui). On ne signale que les comptes reellement en ecart.

import { SEUIL_EQUILIBRE } from "@/lib/reprise/domain/compta";
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
  /** Ecart signe cote debit = calcule - imprime (undefined si pas de total debit imprime). */
  ecartDebit?: number;
  /** Ecart signe cote credit = calcule - imprime (undefined si pas de total credit imprime). */
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

/**
 * Confronte les ecritures extraites aux totaux imprimes par compte. Pour chaque ControleCompte
 * porteur d'au moins un total, on cumule les debits/credits des ecritures du meme compte et on
 * compare. Un compte est "en ecart" si |calcule - imprime| depasse SEUIL_EQUILIBRE cote debit
 * OU cote credit. PUR, deterministe.
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
    const ecartDebit = aDebit ? arrondi(debitCalcule - (c.totalDebit as number)) : undefined;
    const ecartCredit = aCredit ? arrondi(creditCalcule - (c.totalCredit as number)) : undefined;

    const enEcartDebit = ecartDebit !== undefined && Math.abs(ecartDebit) >= SEUIL_EQUILIBRE;
    const enEcartCredit = ecartCredit !== undefined && Math.abs(ecartCredit) >= SEUIL_EQUILIBRE;
    if (enEcartDebit || enEcartCredit) {
      enEcart.push({
        compte: c.compte,
        debitCalcule,
        creditCalcule,
        debitImprime: c.totalDebit,
        creditImprime: c.totalCredit,
        ecartDebit,
        ecartCredit,
      });
    }
  }

  return { enEcart, nbComptesControles, nbEnEcart: enEcart.length };
}
