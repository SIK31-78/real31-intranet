// Domaine PUR de l'OMISSION DES PAIRES de repartition comptabilisee en N+1 - aucune I/O.
//
// Le cas (mesure sur S0303 / Matera) : certains syndics comptabilisent la repartition de
// l'exercice clos N-1 en MOUVEMENTS de l'exercice suivant N, a la date de l'AG qui approuve
// les comptes. Leur grand livre N porte alors, pour chaque compte de classe 6 :
//   - un A-NOUVEAU (report d'ouverture) = le solde de la charge de N-1 ;
//   - un bloc d'ecritures a la date de l'AG qui CREDITE le compte du montant exact de ce
//     report (et debite le 701 du total - classe 7, hors entries.xlsx).
// Ce n'est pas une negligence et un re-export ne changera rien.
//
// REMEDE : omettre LES DEUX (le report ET les ecritures de cloture) du fichier d'import -
// ils ne deplacent aucun solde de cloture, et leur omission leve le refus eStale sur un
// a-nouveau de classe 6.
//
// DEUX GARDES (non negociables) :
//   1. le declencheur est ARITHMETIQUE, jamais le libelle ("Cloture" est du texte libre) :
//      on repere les ecritures par leur montant et leur date, pas par leur nom ;
//   2. la condition doit etre vraie sur TOUS les comptes de classe 6 sans exception -
//      UN SEUL compte qui ne s'annule pas => on n'omet RIEN, et on diagnostique.
//
// ⚠ La classe 7 ne se traite pas ainsi : elle ne passe pas par entries.xlsx mais par le
// module Eclatement, qui prend un SOLDE, pas des ecritures. Ses a-nouveaux sont sans objet.
// ⚠ Consequence : si le sortant a deja passe la repartition de N, ne JAMAIS lancer celle
// d'eStale sur l'exercice N (les comptes 450 seraient servis deux fois).

import { SEUIL_EQUILIBRE } from "@/lib/reprise/domain/compta";
import type { ControleCompte, LigneEcriture } from "@/lib/reprise/domain/ecriture";

/** Une paire omissible : le compte de classe 6, son report, la date du bloc de cloture. */
export interface PaireRepartition {
  compte: string;
  /** Report a-nouveau SIGNE (debit - credit) du compte. */
  reportSigne: number;
  /** Indices (dans le tableau de lignes passe) des ecritures de cloture omises. */
  indicesLignes: number[];
}

/** Verdict de la detection : applicable + la date du bloc, ou non applicable + le pourquoi. */
export interface VerdictOmission {
  /** true si l'omission peut s'appliquer (TOUS les comptes 6 s'annulent au centime). */
  applicable: boolean;
  /** Date ISO du bloc de repartition detecte (la date de l'AG chez le sortant). */
  dateRepartition?: string;
  /** Les paires a omettre (une par compte de classe 6 a report non nul). */
  paires: PaireRepartition[];
  /**
   * Comptes de classe 6 dont report + ecritures candidates ne s'annulent PAS : tant que
   * cette liste n'est pas vide, on n'omet RIEN (garde n.2). PII-free (numeros + montants).
   */
  comptesNonAnnules: { compte: string; reportSigne: number; net: number }[];
  /** Notes de diagnostic PII-free. */
  notes: string[];
}

/** Arrondi au centime. */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Report signe (debit - credit) d'un controle. */
function reportSigne(c: ControleCompte): number {
  return arrondi((c.reportDebit ?? 0) - (c.reportCredit ?? 0));
}

/** Somme signee des lignes (debit positif, credit negatif). */
function sommeSignee(lignes: LigneEcriture[]): number {
  return arrondi(lignes.reduce((s, l) => s + (l.sens === "debit" ? l.montant : -l.montant), 0));
}

/**
 * Detecte le bloc de repartition N-1 comptabilise dans le grand livre N.
 *
 * Demarche (arithmetique pure) :
 *   1. comptes de classe 6 avec report non nul (depuis les controles capturés) ;
 *   2. dates candidates = dates portant au moins une ecriture sur un de ces comptes ;
 *   3. une date D est LA date de repartition si, pour CHAQUE compte, la somme signee de ses
 *      ecritures du jour D vaut exactement l'oppose de son report (net 0,00 au centime) ;
 *   4. aucune date ne satisfait tous les comptes -> non applicable, avec le diagnostic de la
 *      meilleure date (celle qui annule le plus de comptes) pour orienter l'humain.
 */
export function detecterPairesRepartition(
  lignes: LigneEcriture[],
  controles: ControleCompte[],
): VerdictOmission {
  const comptes6 = controles.filter((c) => {
    if (Math.abs(reportSigne(c)) < SEUIL_EQUILIBRE) return false;
    const premier = c.compte.trim().charAt(0);
    return premier === "6";
  });
  if (comptes6.length === 0) {
    return {
      applicable: false,
      paires: [],
      comptesNonAnnules: [],
      notes: ["Aucun report a-nouveau de classe 6 : rien a omettre (cas nominal)."],
    };
  }

  const comptesVises = new Set(comptes6.map((c) => c.compte));
  // Lignes de classe 6 des comptes vises, indexees par (date, compte).
  const parDate = new Map<string, Map<string, number[]>>();
  lignes.forEach((l, index) => {
    if (!comptesVises.has(l.compte)) return;
    const parCompte = parDate.get(l.date) ?? new Map<string, number[]>();
    const arr = parCompte.get(l.compte) ?? [];
    arr.push(index);
    parCompte.set(l.compte, arr);
    parDate.set(l.date, parCompte);
  });

  let meilleure: { date: string; annules: PaireRepartition[]; rates: { compte: string; reportSigne: number; net: number }[] } | null = null;

  for (const [date, parCompte] of parDate) {
    const annules: PaireRepartition[] = [];
    const rates: { compte: string; reportSigne: number; net: number }[] = [];
    for (const c of comptes6) {
      const indices = parCompte.get(c.compte) ?? [];
      const somme = sommeSignee(indices.map((i) => lignes[i]!));
      const net = arrondi(reportSigne(c) + somme);
      if (indices.length > 0 && Math.abs(net) < SEUIL_EQUILIBRE) {
        annules.push({ compte: c.compte, reportSigne: reportSigne(c), indicesLignes: indices });
      } else {
        rates.push({ compte: c.compte, reportSigne: reportSigne(c), net });
      }
    }
    if (!meilleure || annules.length > meilleure.annules.length) {
      meilleure = { date, annules, rates };
    }
    if (rates.length === 0) {
      return {
        applicable: true,
        dateRepartition: date,
        paires: annules,
        comptesNonAnnules: [],
        notes: [
          `Repartition N-1 comptabilisee dans l'exercice suivant detectee (bloc du ${date}) : ` +
            `${annules.length} paire(s) a-nouveau/cloture nettes a 0,00 - omission possible.`,
        ],
      };
    }
  }

  return {
    applicable: false,
    ...(meilleure ? { dateRepartition: meilleure.date } : {}),
    paires: meilleure?.annules ?? [],
    comptesNonAnnules: meilleure?.rates ?? comptes6.map((c) => ({ compte: c.compte, reportSigne: reportSigne(c), net: reportSigne(c) })),
    notes: [
      "Omission des paires REFUSEE : au moins un compte de classe 6 ne s'annule pas au centime " +
        "(garde arithmetique). Ne rien omettre, diagnostiquer compte par compte.",
    ],
  };
}

/** Resultat de l'application de l'omission : lignes filtrees + reports 6 neutralises. */
export interface ResultatOmission {
  /** Les lignes SANS les ecritures de cloture omises. */
  lignes: LigneEcriture[];
  /** Les controles avec les reports des comptes omis remis a zero. */
  controles: ControleCompte[];
  /** Nombre de paires omises. */
  nbPairesOmises: number;
}

/**
 * Applique un verdict d'omission APPLICABLE : retire les ecritures de cloture et neutralise
 * les reports des comptes concernes. Pur (ne mute rien). Verdict non applicable => identite.
 *
 * CONTROLE OBLIGATOIRE EN AVAL (auto-check n.2/n.6) : les soldes par classe du fichier
 * produit doivent reproduire la balance du sortant au centime a chaque date de cloture.
 */
export function appliquerOmission(
  lignes: LigneEcriture[],
  controles: ControleCompte[],
  verdict: VerdictOmission,
): ResultatOmission {
  if (!verdict.applicable) return { lignes: [...lignes], controles: [...controles], nbPairesOmises: 0 };
  const aOmettre = new Set(verdict.paires.flatMap((p) => p.indicesLignes));
  const comptesOmis = new Set(verdict.paires.map((p) => p.compte));
  return {
    lignes: lignes.filter((_, i) => !aOmettre.has(i)),
    controles: controles.map((c) =>
      comptesOmis.has(c.compte) ? { ...c, reportDebit: 0, reportCredit: 0 } : c,
    ),
    nbPairesOmises: verdict.paires.length,
  };
}
