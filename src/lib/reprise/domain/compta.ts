// Domaine PUR de la reprise comptable (aucune I/O, aucun import technique).
//
// Objet central : la BALANCE d'une copro, agregee par CLASSE comptable (1..7). C'est la
// mesure qui permettra plus tard de verifier "la balance tombe a 0 apres reprise". Ici,
// en increment 0 (lecture seule), on se contente de la CONSTRUIRE et de la mesurer.
//
// Convention de signe retenue : solde d'un compte = debit - credit (signe). Un compte
// "debiteur" a un solde > 0, un compte "crediteur" un solde < 0. L'equilibre global se
// lit sur les TOTAUX : total des debits == total des credits (a l'arrondi pres).

/** Classe comptable = 1er chiffre de la nomenclature (plan comptable syndic : 1..7). */
export type ClasseComptable = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Solde d'un compte de l'exercice : debit et credit cumules + solde signe (debit - credit). */
export interface SoldeCompte {
  /** Nomenclature eStale (ex. "5120001", "450...", "701..."). */
  nomenclature: string;
  /**
   * ID eStale du compte (AccountingAccount.id). OPTIONNEL : les producteurs PURS de
   * SoldeCompte (agregation d'ecritures dans ecriture.ts) n'en ont aucun. Renseigne par la
   * LECTURE eStale, ou il est indispensable a l'ECRITURE : createEntryExpert exige un
   * accountID, pas une nomenclature -> sans lui, l'import du bloc A ne peut pas resoudre sa
   * cible (et doit refuser AVANT d'ecrire quoi que ce soit).
   */
  id?: string;
  /**
   * Cle de repartition PORTEE PAR LE COMPTE (AccountingAccount.dkID). OPTIONNEL, meme raison.
   * C'est la cle a reprendre telle quelle sur une ecriture visant ce compte : le code de cle
   * du plan de mapping ("001") est une convention cabinet, pas un ID eStale.
   */
  dkID?: string;
  /** Libelle du compte (facultatif : eStale le fournit, mais pas indispensable au calcul). */
  libelle?: string;
  /**
   * Code de la cle de repartition portee par le compte eStale (dk.code, ex. "001"). Facultatif :
   * seul l'adapter reel le remplit. LA CLE DU COMPTE FAIT FOI pour les ecritures de reprise
   * (certains comptes portent une autre cle que la 001 par defaut - mesure sur S0303).
   */
  cle?: string;
  /** Classe deduite du 1er chiffre de la nomenclature. */
  classe: ClasseComptable;
  /** Cumul des debits du compte sur l'exercice. */
  debit: number;
  /** Cumul des credits du compte sur l'exercice. */
  credit: number;
  /** Solde signe = debit - credit. */
  solde: number;
}

/** Agregat (debit, credit, solde) d'une classe comptable. */
export interface AgregatClasse {
  debit: number;
  credit: number;
  /** Solde signe de la classe = debit - credit. */
  solde: number;
}

/** Balance de reprise : agregats par classe + totaux + verdict d'equilibre. */
export interface BalanceReprise {
  /** Un agregat par classe 1..7 (toujours les 7 clefs, a 0 si la classe est absente). */
  parClasse: Record<ClasseComptable, AgregatClasse>;
  /** Total de tous les debits (toutes classes). */
  totalDebit: number;
  /** Total de tous les credits (toutes classes). */
  totalCredit: number;
  /** true si |totalDebit - totalCredit| < SEUIL_EQUILIBRE (la balance "tombe a 0"). */
  equilibre: boolean;
  /** Ecart signe = totalDebit - totalCredit (0 si equilibre parfait). */
  ecart: number;
}

/** Sous ce seuil (en euros), on considere deux montants comptables egaux (bruit d'arrondi). */
export const SEUIL_EQUILIBRE = 0.005;

/** Les 7 classes comptables, dans l'ordre (sert a initialiser un agregat complet). */
const CLASSES: ClasseComptable[] = [1, 2, 3, 4, 5, 6, 7];

/** Arrondi comptable au centime (evite le bruit de l'addition en virgule flottante). */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Classe comptable d'une nomenclature = son 1er chiffre. "5120001" -> 5, "6" -> 6.
 * Le plan comptable des syndicats de copropriete n'utilise que les classes 1..7 : une
 * nomenclature hors de cet intervalle (vide, non numerique, 0/8/9) est une anomalie et
 * leve une erreur explicite (plutot que de la ranger silencieusement au mauvais endroit).
 */
export function classeDe(nomenclature: string): ClasseComptable {
  const m = nomenclature.trim().match(/^(\d)/);
  const premier = m ? Number(m[1]) : NaN;
  if (premier >= 1 && premier <= 7) return premier as ClasseComptable;
  throw new Error(
    `Nomenclature "${nomenclature}" : classe comptable hors 1..7 (1er chiffre attendu).`,
  );
}

/**
 * Agrege une liste de soldes de comptes en une BalanceReprise (par classe + totaux).
 * On additionne debit et credit separement (pas les soldes signes) pour pouvoir juger
 * l'equilibre sur les totaux. equilibre = |totalDebit - totalCredit| < SEUIL_EQUILIBRE.
 */
export function construireBalance(comptes: SoldeCompte[]): BalanceReprise {
  const parClasse = {} as Record<ClasseComptable, AgregatClasse>;
  for (const c of CLASSES) parClasse[c] = { debit: 0, credit: 0, solde: 0 };

  let totalDebit = 0;
  let totalCredit = 0;
  for (const compte of comptes) {
    const agg = parClasse[compte.classe];
    agg.debit += compte.debit;
    agg.credit += compte.credit;
    totalDebit += compte.debit;
    totalCredit += compte.credit;
  }

  for (const c of CLASSES) {
    const agg = parClasse[c];
    agg.debit = arrondi(agg.debit);
    agg.credit = arrondi(agg.credit);
    agg.solde = arrondi(agg.debit - agg.credit);
  }
  totalDebit = arrondi(totalDebit);
  totalCredit = arrondi(totalCredit);
  const ecart = arrondi(totalDebit - totalCredit);

  return {
    parClasse,
    totalDebit,
    totalCredit,
    equilibre: Math.abs(ecart) < SEUIL_EQUILIBRE,
    ecart,
  };
}

// --- Exercices comptables eStale : etat et prerequis d'import ---------------------
//
// SONDE SE999 (2026-08-18) : une ecriture datee HORS de tout exercice existant est REFUSEE
// par eStale, AUCUNE mutation ne cree un exercice (updateAccounting n'offre que
// lock/unlock/close/unclose), et un exercice VERROUILLE (lockedAt) refuse tout avec la meme
// erreur opaque "Oupss" qu'un autre probleme. Consequence : la regle "toutes les ecritures
// N-1" est un PREREQUIS DE CREATION de la copro (poser le debut de compta au debut de
// l'historique a reprendre), et l'import doit VERIFIER l'etat des exercices AVANT d'ecrire
// - jamais decouvrir le refus en plein milieu de 300 mutations.

/** Un exercice comptable eStale, reduit a ce que la reprise controle. */
export interface EtatExercice {
  /** ID de l'Accounting eStale. */
  accountingID: string;
  /** Bornes ISO "AAAA-MM-JJ" (Daterange eStale). */
  debut: string;
  fin: string;
  /** lockedAt non nul : TOUTE ecriture est refusee tant qu'il n'est pas deverrouille. */
  verrouille: boolean;
  /** closedAt non nul : exercice clos. */
  clos: boolean;
}

export interface VerdictExercices {
  /** true : chaque date a un exercice existant, ni verrouille ni clos. */
  ok: boolean;
  /** Motifs bloquants, PII-free (dates et bornes d'exercices seulement). */
  motifs: string[];
}

/**
 * Verifie que CHAQUE date d'ecriture tombe dans un exercice existant, deverrouille et non
 * clos. Pur : meme entree => meme sortie. Les dates sont ISO (LigneEcriture.date). Les dates
 * illisibles (vides) sont ignorees ici - le normaliseur les signale deja par ailleurs.
 */
export function verifierExercicesPourDates(
  exercices: EtatExercice[],
  datesISO: readonly string[],
): VerdictExercices {
  const motifs: string[] = [];
  const bornes = exercices.map((e) => `[${e.debut} ; ${e.fin}]`).join(", ") || "(aucun exercice)";

  const horsExercice = new Set<string>();
  const exercicesBloques = new Map<string, EtatExercice>();
  for (const date of new Set(datesISO)) {
    if (!date) continue;
    const couvrant = exercices.find((e) => date >= e.debut && date <= e.fin);
    if (!couvrant) {
      horsExercice.add(date);
    } else if (couvrant.verrouille || couvrant.clos) {
      exercicesBloques.set(couvrant.accountingID, couvrant);
    }
  }

  if (horsExercice.size > 0) {
    const echantillon = [...horsExercice].sort().slice(0, 5).join(", ");
    motifs.push(
      `${horsExercice.size} date(s) d'ecriture hors de tout exercice eStale existant (ex. ${echantillon} ; exercices : ${bornes}). ` +
        `Aucune mutation ne cree un exercice : le debut de compta de la copro doit couvrir l'historique a reprendre (prerequis de creation).`,
    );
  }
  for (const e of exercicesBloques.values()) {
    motifs.push(
      `L'exercice [${e.debut} ; ${e.fin}] est ${e.clos ? "CLOS" : "VERROUILLE (lockedAt)"} : toute ecriture serait refusee. ` +
        `${e.clos ? "Le rouvrir (unclose)" : "Le deverrouiller (unlock)"} avant l'import.`,
    );
  }

  return { ok: motifs.length === 0, motifs };
}
