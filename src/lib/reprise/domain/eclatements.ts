// Domaine PUR de la FICHE D'ECLATEMENTS des classes 1 et 7 - aucune I/O.
//
// « Expert » reprend sans contrepartie les ecritures des classes 4/5/6 (entries.xlsx) ;
// « Eclatement » reprend sans contrepartie les classes 1 et 7 - il prend un SOLDE et une
// CLE, pas des ecritures. entries.xlsx ne doit JAMAIS alimenter l'eclatement.
//
// Savoir metier encode (S0303) :
//   - COLLISION DE NUMEROTATION : chez eStale, 105 et 1031 sont ventiles PAR LOT ; chez le
//     sortant, PAR COPROPRIETAIRE. Le mapping compte a compte est IMPOSSIBLE : l'eclatement
//     est la seule voie. Un copropriétaire a 4 lots a UN compte chez le sortant et QUATRE
//     chez eStale.
//   - une avance de tresorerie (1031) suit le LOT mais N'EST PAS proportionnelle aux
//     tantiemes (constituee au fil de l'histoire de chaque lot ; sur S0303 un copropriétaire
//     a 76/1000 portait 609,79 EUR sur 1 219,59, soit 6,6 x sa quote-part). Eclater par
//     tantiemes fausse les comptes individuels SANS qu'aucun total ne bouge : il faut le
//     DETAIL REEL du sortant (balance detaillee, etat date / pre-etat date).
//   - le 701 ne se reprend JAMAIS globalement : additionner les appels PAR CLE (T1+T2+...)
//     et saisir chaque cle separement (les appels de fonds du sortant portent la cle).
//   - 103 est un NOEUD chez eStale : viser 1031 (avances de tresorerie), 1032/1033 selon le cas.
//   - le bandeau « X / X EUR » du module Eclatement doit etre equilibre avant validation.

import { SEUIL_EQUILIBRE } from "@/lib/reprise/domain/compta";
import type { ControleCompte, LigneEcriture } from "@/lib/reprise/domain/ecriture";

/** Detail reel d'un solde a eclater (par lot pour la classe 1, par cle pour la classe 7). */
export interface DetailEclatement {
  /** Libelle de la ligne (lot n.X / cle 001 / T1 2025...). PII-free : jamais un nom. */
  ligne: string;
  /** Montant SIGNE de la ligne (la somme doit retomber sur le solde du compte). */
  montant: number;
  /** Cle de repartition de la ligne si connue (classe 7 : la cle de l'appel). */
  cle?: string;
}

/** Un compte source a saisir dans le module Eclatement : montant + cle par ligne. */
export interface EclatementCompte {
  compteSource: string;
  /** Intitule du compte source si capture (affiche en UI, jamais logue). */
  intitule?: string;
  /** 1er chiffre du compte (1, 2, 3 ou 7). */
  classe: number;
  /** Solde SIGNE (reports inclus) = debit - credit. */
  soldeSigne: number;
  /** Sens de la saisie eStale (solde au credit -> credit). */
  sens: "debit" | "credit";
  /** Montant en VALEUR ABSOLUE (la convention du module). */
  montant: number;
  /**
   * Detail reel des lignes a saisir (fourni par le gestionnaire : balance detaillee,
   * appels de fonds). ABSENT = a completer avant la saisie (warning emis).
   */
  detail?: DetailEclatement[];
  /** Consignes metier specifiques au compte (105/1031 par lot, 701 par cle...). */
  consignes: string[];
}

/** La fiche complete : un bloc par compte + totaux + warnings transverses. */
export interface FicheEclatements {
  comptes: EclatementCompte[];
  /** Somme des soldes signes (le complement attendu de la balance apres entries.xlsx). */
  totalSigne: number;
  warnings: string[];
}

/** Detail reel fourni par le gestionnaire, par compte source. */
export type DetailsParCompte = Record<string, DetailEclatement[]>;

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Consignes metier par racine de compte. */
function consignesPour(compte: string): string[] {
  const c = compte.trim();
  if (/^105/.test(c) || /^1031/.test(c) || /^103\b/.test(c)) {
    return [
      "105/1031 : ventile PAR LOT chez eStale, par copropriétaire chez le sortant - eclatement obligatoire, jamais de mapping compte a compte.",
      "Une avance de tresorerie n'est PAS proportionnelle aux tantiemes : saisir le DETAIL REEL du sortant (balance detaillee / etat date), pas une regle de trois.",
      "103 est un noeud chez eStale : viser 1031 (avances de tresorerie), 1032/1033 selon le cas.",
    ];
  }
  if (/^701/.test(c)) {
    return [
      "701 : ne JAMAIS reprendre globalement - additionner les appels PAR CLE (T1+T2+...) et saisir chaque cle separement (la cle est dans le libelle des appels de fonds du sortant).",
      "Ne PAS repondre Oui a « Compenser en 450 » si les comptes 450 sont deja dans entries.xlsx : la contrepartie serait comptee deux fois (controle : le total 45x ne doit pas bouger).",
    ];
  }
  if (/^702/.test(c)) {
    return [
      "702 (travaux art. 14-2) : garde legitimement son report - creer l'operation de travaux AVANT l'import (671T0x/702T0x), la cle est dans l'Annexe 5 de la convocation.",
    ];
  }
  return [];
}

/**
 * Construit la fiche d'eclatements depuis les ecritures et reports des comptes de classes
 * 1/2/3/7 (ceux que le plan de mapping route en "reporte_bloc_c"). Pur.
 *
 * `comptesVises` = les comptes routes vers l'eclatement (sortie de construireEntries).
 * `details` = le detail reel saisi/verse par le gestionnaire, par compte source (optionnel).
 * `intitules` = noms imprimes des comptes source (affichage UI).
 */
export function construireFicheEclatements(
  lignes: LigneEcriture[],
  controles: ControleCompte[],
  comptesVises: string[],
  details: DetailsParCompte = {},
  intitules: Record<string, string> = {},
): FicheEclatements {
  const vises = new Set(comptesVises);
  const warnings: string[] = [];

  // Solde signe par compte = report + somme signee des ecritures.
  const soldes = new Map<string, number>();
  for (const c of controles) {
    if (!vises.has(c.compte)) continue;
    soldes.set(c.compte, arrondi((c.reportDebit ?? 0) - (c.reportCredit ?? 0)));
  }
  for (const l of lignes) {
    if (!vises.has(l.compte)) continue;
    const delta = l.sens === "debit" ? l.montant : -l.montant;
    soldes.set(l.compte, arrondi((soldes.get(l.compte) ?? 0) + delta));
  }

  const comptes: EclatementCompte[] = [];
  let totalSigne = 0;
  for (const compte of [...vises].sort()) {
    const solde = soldes.get(compte) ?? 0;
    if (Math.abs(solde) < SEUIL_EQUILIBRE) continue; // compte solde : rien a saisir
    totalSigne = arrondi(totalSigne + solde);

    const detail = details[compte];
    if (detail) {
      const sommeDetail = arrondi(detail.reduce((s, d) => s + d.montant, 0));
      if (Math.abs(sommeDetail - solde) >= SEUIL_EQUILIBRE) {
        warnings.push(
          `compte ${compte} : le detail fourni (${sommeDetail.toFixed(2)}) ne retombe pas sur le solde (${solde.toFixed(2)}) - a corriger avant saisie.`,
        );
      }
    } else {
      warnings.push(
        `compte ${compte} : aucun detail reel fourni - a completer (balance detaillee du sortant, appels de fonds, etat date) avant la saisie dans le module Eclatement.`,
      );
    }

    const classe = Number(compte.trim().charAt(0)) || 0;
    comptes.push({
      compteSource: compte,
      ...(intitules[compte] ? { intitule: intitules[compte] } : {}),
      classe,
      soldeSigne: solde,
      sens: solde >= 0 ? "debit" : "credit",
      montant: Math.abs(solde),
      ...(detail ? { detail } : {}),
      consignes: consignesPour(compte),
    });
  }

  return { comptes, totalSigne, warnings };
}
