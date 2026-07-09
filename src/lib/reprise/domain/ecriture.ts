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

/**
 * Total IMPRIME d'un compte tel que la source le publie (ligne "Total compte X" ou solde de
 * fin de compte). Ce n'est PAS une ecriture : c'est un point de controle deterministe. Quand
 * le grand livre imprime ces totaux, on peut verifier que la somme des ecritures qu'on a
 * extraites pour ce compte retombe bien dessus -> localisation fine d'un desequilibre.
 */
export interface ControleCompte {
  /** Compte tel que la source le nomme (nomenclature du syndic sortant). */
  compte: string;
  /** Total des debits imprime pour ce compte (si la source le publie). */
  totalDebit?: number;
  /** Total des credits imprime pour ce compte (si la source le publie). */
  totalCredit?: number;
  /**
   * Report a-nouveau / solde anterieur DEBIT de ce compte (report d'ouverture, exclu des
   * ecritures mais INTEGRE au controle : le "Total compte" imprime inclut le report, or on ne
   * reprend pas les reports comme ecritures -> report + somme(ecritures) doit egaler le total).
   */
  reportDebit?: number;
  /** Report a-nouveau / solde anterieur CREDIT de ce compte (idem cote credit). */
  reportCredit?: number;
}

/** Sortie de l'extraction du grand livre : les ecritures + notes de vigilance. */
export interface JeuEcritures {
  lignes: LigneEcriture[];
  /** Points de vigilance (lignes exclues, comptes hors 1-7, formats douteux...). */
  notes: string[];
  /**
   * Totaux imprimes par compte captures a l'extraction (optionnel : seul le pipeline hybride
   * les fournit ; les adapters full-LLM ne les remplissent pas). Champ ADDITIF : ne casse
   * aucun adapter existant, ne modifie pas le port ExtractionComptaProvider.
   */
  controles?: ControleCompte[];
  /**
   * Intitule (nom) imprime dans l'EN-TETE de chaque compte source, indexe par numero de compte
   * (ex. "4501.100489139" -> "M DUPONT JEAN"). Champ ADDITIF, optionnel : seul le pipeline couche
   * texte (positions) le remplit aujourd'hui ; les adapters full-LLM ne le fournissent pas. Sert
   * a l'appariement par NOM du mapping (401 fournisseurs, 450 coproprietaires) de la reprise.
   * ATTENTION PII : ces valeurs portent des noms de personnes -> ne JAMAIS les logguer ni les
   * exposer dans une note/rapport ; elles restent internes au resolveur de mapping.
   */
  intitules?: Record<string, string>;
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

// --- Vue "grand livre par compte" (pour la revue humaine du mapping) ---------------
//
// Presente les ecritures d'UN compte source en colonnes debit/credit (au lieu du couple
// sens+montant du domaine). Sert a l'ecran de revue : voir les mouvements d'un compte 450
// avant de trancher a qui l'imputer. On groupe COTE DOMAINE (pur, teste) pour que la route
// n'envoie pas 835 lignes a plat mais un dictionnaire indexe par compte.
//
// ATTENTION PII : `libelle` peut porter un nom -> affiche en UI (app interne, c'est le but)
// mais JAMAIS logue ni recopie dans une note/rapport.

/** Une ecriture rendue en colonnes debit/credit (0 dans la colonne non concernee). */
export interface LigneGrandLivreVue {
  date: string;
  libelle: string;
  piece?: string;
  /** Montant au debit (0 si l'ecriture est au credit). */
  debit: number;
  /** Montant au credit (0 si l'ecriture est au debit). */
  credit: number;
}

/** Ecritures d'UN compte source + totaux (le "grand livre" de ce compte). */
export interface GrandLivreCompte {
  compte: string;
  lignes: LigneGrandLivreVue[];
  totalDebit: number;
  totalCredit: number;
  /** Solde signe = totalDebit - totalCredit. */
  solde: number;
  nbLignes: number;
}

/** Arrondi comptable au centime (local : evite d'importer un util technique dans ce domaine pur). */
function arrondiCentime(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Groupe les ecritures d'un grand livre PAR compte source, en colonnes debit/credit + totaux.
 * Pur : meme entree => meme sortie. L'ordre des lignes d'un compte suit l'ordre d'apparition.
 */
export function grouperEcrituresParCompte(lignes: LigneEcriture[]): Record<string, GrandLivreCompte> {
  const out: Record<string, GrandLivreCompte> = {};
  for (const l of lignes) {
    const g =
      out[l.compte] ??
      (out[l.compte] = { compte: l.compte, lignes: [], totalDebit: 0, totalCredit: 0, solde: 0, nbLignes: 0 });
    const debit = l.sens === "debit" ? l.montant : 0;
    const credit = l.sens === "credit" ? l.montant : 0;
    const ligne: LigneGrandLivreVue = { date: l.date, libelle: l.libelle, debit, credit };
    if (l.piece) ligne.piece = l.piece;
    g.lignes.push(ligne);
    g.totalDebit += debit;
    g.totalCredit += credit;
    g.nbLignes++;
  }
  for (const g of Object.values(out)) {
    g.totalDebit = arrondiCentime(g.totalDebit);
    g.totalCredit = arrondiCentime(g.totalCredit);
    g.solde = arrondiCentime(g.totalDebit - g.totalCredit);
  }
  return out;
}

/**
 * Vue grand livre POUR LA REVUE de mapping (regle Sekou) : le detail ligne a ligne n'est utile
 * que pour le BLOC A (classes 4/5, tiers et tresorerie - c'est la qu'on decide a qui imputer,
 * notamment les 450 homonymes). Pour les classes reportees (6 et 1/2/3/7), on controle les
 * SOLDES de chaque compte, pas chaque ligne -> on garde totaux + nbLignes mais on vide `lignes`
 * (allege aussi nettement le payload : la classe 6 est le gros du grand livre).
 */
export function grouperEcrituresPourRevue(lignes: LigneEcriture[]): Record<string, GrandLivreCompte> {
  const classeParCompte = new Map<string, ClasseComptable>();
  for (const l of lignes) if (!classeParCompte.has(l.compte)) classeParCompte.set(l.compte, l.classe);

  const groupes = grouperEcrituresParCompte(lignes);
  for (const g of Object.values(groupes)) {
    const classe = classeParCompte.get(g.compte);
    if (classe !== 4 && classe !== 5) g.lignes = [];
  }
  return groupes;
}
