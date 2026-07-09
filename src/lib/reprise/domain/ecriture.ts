// Domaine PUR des ECRITURES d'un grand livre (aucune I/O, aucun import technique).
//
// La reprise comptable ne reprend pas seulement les SOLDES : on reprend TOUTES les
// ecritures (decision Sekou). Une ecriture = un mouvement debit OU credit sur un compte,
// a une date, avec un libelle et un montant POSITIF (le sens porte l'information de signe).
//
// Filet de verification (le coeur de la demande) : un grand livre COMPLET (toutes classes)
// est forcement equilibre -> somme des debits == somme des credits. Le FORMAT du grand
// livre change d'un syndic a l'autre (Foncia, Citya, Nexity...), mais cette egalite, elle,
// ne change jamais. C'est l'auto-check deterministe qui rend l'extraction IA fiable quel
// que soit le moteur et quelle que soit la mise en page source.
//
// On reutilise le domaine de la balance (compta.ts) : les ecritures sont d'abord agregees
// par compte (cumuls debit/credit) puis passees a `construireBalance` -> memes agregats par
// classe, memes totaux, meme tolerance d'arrondi.

import {
  classeDe,
  construireBalance,
  type AgregatClasse,
  type BalanceReprise,
  type ClasseComptable,
  type SoldeCompte,
} from "@/lib/reprise/domain/compta";

/** Sens comptable d'un mouvement. Le montant reste positif ; c'est le sens qui signe. */
export type SensEcriture = "debit" | "credit";

/** Une ecriture du grand livre = un mouvement sur un compte (jamais un solde ni un total). */
export interface LigneEcriture {
  /** Date normalisee ISO (AAAA-MM-JJ). */
  date: string;
  /** Compte tel que la source le nomme (nomenclature du syndic sortant, ex. "4010000"). */
  compte: string;
  /** Libelle de l'ecriture. */
  libelle: string;
  /** Sens du mouvement (debit ou credit). */
  sens: SensEcriture;
  /** Montant TOUJOURS positif (valeur absolue) ; le signe est porte par `sens`. */
  montant: number;
  /** Classe comptable deduite du 1er chiffre du compte (1..7). */
  classe: ClasseComptable;
  /** Numero de piece / justificatif, si la source le fournit. */
  piece?: string;
}

/** Sortie de l'extraction du grand livre : les ecritures + notes de vigilance. */
export interface JeuEcritures {
  lignes: LigneEcriture[];
  /** Points de vigilance (lignes exclues, comptes hors 1-7, formats douteux...). */
  notes: string[];
}

/** Verdict d'equilibre GLOBAL d'un grand livre + detail par classe. */
export interface EquilibreGrandLivre {
  /** true si somme(debit) == somme(credit) a l'arrondi pres. */
  equilibre: boolean;
  /** Ecart signe = totalDebit - totalCredit (0 si equilibre parfait). */
  ecart: number;
  /** Agregat (debit, credit, solde) par classe 1..7. */
  parClasse: Record<ClasseComptable, AgregatClasse>;
}

/**
 * Agrege des lignes d'ecriture en une BalanceReprise (par classe + totaux + equilibre).
 * On cumule d'abord debit/credit PAR COMPTE (une ligne debit augmente le debit du compte,
 * une ligne credit son credit), puis on delegue a `construireBalance` : on herite ainsi de
 * l'agregation par classe, des totaux et de la tolerance d'arrondi du domaine balance.
 */
export function balanceDesEcritures(lignes: LigneEcriture[]): BalanceReprise {
  const parCompte = new Map<string, { debit: number; credit: number }>();
  for (const l of lignes) {
    const agg = parCompte.get(l.compte) ?? { debit: 0, credit: 0 };
    if (l.sens === "debit") agg.debit += l.montant;
    else agg.credit += l.montant;
    parCompte.set(l.compte, agg);
  }
  const comptes: SoldeCompte[] = [...parCompte.entries()].map(([nomenclature, agg]) => ({
    nomenclature,
    classe: classeDe(nomenclature),
    debit: agg.debit,
    credit: agg.credit,
    solde: agg.debit - agg.credit,
  }));
  return construireBalance(comptes);
}

/**
 * Auto-check FORT : un grand livre complet doit etre equilibre (total debit == total credit).
 * Renvoie le verdict global + le detail par classe (utile pour localiser un desequilibre).
 */
export function verifierEquilibreGrandLivre(lignes: LigneEcriture[]): EquilibreGrandLivre {
  const b = balanceDesEcritures(lignes);
  return { equilibre: b.equilibre, ecart: b.ecart, parClasse: b.parClasse };
}
