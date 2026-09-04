// Filet de securite de la facturation de gestion courante trimestrielle.
//
// POURQUOI. Depuis que `PENNYLANE_FACTURE_VALIDEE` peut etre active, une facture
// part VALIDEE : elle porte un numero et ne peut plus etre ni modifiee ni
// supprimee. Une erreur de montant n'est donc plus une erreur d'ecran, c'est une
// erreur comptablement engagee. Le geste « lancer le trimestre » touche ~256
// coproprietes d'un coup : il faut un dernier regard, ligne par ligne, avant
// d'engager.
//
// LA REFERENCE, C'EST LE CONTRAT -- JAMAIS LE TRIMESTRE PRECEDENT. Une copro
// reprise en cours de trimestre a un T-1 faux ou absent : comparer a T-1
// declencherait une alerte sur exactement les dossiers ou il ne faut pas en
// avoir, et resterait muet sur une saisie de contrat fausse (le vrai risque,
// cf. le champ « honoraires » saisi a la main dans le recap d'AG, qui ouvre le
// nouveau cycle de contrat). L'attendu du trimestre se deduit donc du contrat :
//   attendu = honoraires annuels TTC / 4 -> HT, + forfait postaux annuel / 4,
//   le tout au prorata des jours couverts si la copro a ete prise en gestion en
//   cours de trimestre.
//
// Fonctions PURES : aucune date « maintenant », aucune lecture d'environnement,
// aucun acces au depot. Tout entre par les parametres.

import { htDepuisTtc } from "./commun";

/** Verdict porte par une ligne du trimestre. */
export type VerdictLigne =
  /** Montant conforme au contrat. */
  | "ok"
  /** Conforme, mais au prorata : copro prise en gestion en cours de trimestre. */
  | "prorata"
  /** Montant sous l'attendu au-dela de la tolerance : perte de recette. */
  | "sous_facturation"
  /** Surfacturation de +10 % a +20 % : alerte orange, validable a la main. */
  | "alerte_10"
  /** Surfacturation au-dela de +20 % : exige la confirmation dactylographiee. */
  | "alerte_20"
  /** Deja facturee sur ce trimestre : ne repart pas. */
  | "deja_facturee"
  /** Contrat absent ou a 0 EUR : rien ne part tant que ce n'est pas renseigne. */
  | "contrat_absent";

/** Ecart en euros en-deca duquel on considere que le montant colle au contrat.
 *  Volontairement au centime : une sous-facturation, meme minime, doit se voir. */
export const TOLERANCE_EUROS = 0.01;

/** Surfacturation a partir de laquelle la ligne passe en alerte orange (+10 %). */
export const SEUIL_ALERTE = 0.1;

/** Surfacturation au-dela de laquelle la confirmation ecrite est exigee (+20 %). */
export const SEUIL_CONFIRMATION_ECRITE = 0.2;

/** Le mot que la comptable doit taper pour engager une ligne au-dela de +20 %. */
export const MOT_DE_CONFIRMATION = "facturer";

/**
 * La saisie vaut-elle confirmation ? Insensible a la casse et aux espaces
 * (avant, apres, et meme au milieu : on cherche une preuve d'intention, pas une
 * dictee). Tout le reste refuse.
 */
export function motConfirmationValide(saisie: string): boolean {
  return saisie.replace(/\s+/g, "").toLowerCase() === MOT_DE_CONFIRMATION;
}

/** Bornes d'un trimestre civil, en jours REELS (T1 fait 90 ou 91 jours). */
export interface BornesTrimestre {
  /** Premier jour, ISO "YYYY-MM-DD". */
  debut: string;
  /** Dernier jour, ISO "YYYY-MM-DD". */
  fin: string;
  /** Nombre de jours du trimestre, bornes incluses. */
  jours: number;
}

/** Dernier mois et dernier jour de chaque trimestre civil. */
const FIN_TRIMESTRE: Record<number, [number, number]> = {
  1: [3, 31],
  2: [6, 30],
  3: [9, 30],
  4: [12, 31],
};

function jourUTC(iso: string): number {
  const [a, m, j] = iso.split("-").map(Number);
  return Date.UTC(a ?? 0, (m ?? 1) - 1, j ?? 1);
}

function deuxChiffres(n: number): string {
  return String(n).padStart(2, "0");
}

/** Bornes d'une periode "AAAA-Tn". Leve si la periode est mal formee. */
export function bornesTrimestre(periode: string): BornesTrimestre {
  const m = /^(\d{4})-T([1-4])$/.exec(periode);
  if (!m) throw new Error(`Periode invalide : ${periode} (attendu "AAAA-Tn").`);
  const annee = Number(m[1]);
  const t = Number(m[2]);
  const premierMois = (t - 1) * 3 + 1;
  const [moisFin, jourFin] = FIN_TRIMESTRE[t] as [number, number];
  const debut = `${annee}-${deuxChiffres(premierMois)}-01`;
  const fin = `${annee}-${deuxChiffres(moisFin)}-${deuxChiffres(jourFin)}`;
  // Jours reels, bornes incluses : T1 fait 90 jours, 91 en annee bissextile.
  const jours = (jourUTC(fin) - jourUTC(debut)) / 86_400_000 + 1;
  return { debut, fin, jours };
}

/**
 * Ramene une valeur de date a un ISO "YYYY-MM-DD", ou null si elle n'en est pas
 * une. La date de prise en gestion vient de `Copropriete.syndicInitialDate`,
 * stockee en timestamp ("2026-04-02T00:00:00") ; ailleurs dans l'app le champ
 * `priseEnGestion` du domaine est un LIBELLE humain ("mars 2018", "-"), qui ne
 * doit surtout pas etre pris pour une date. D'ou ce filtre strict : ce qui n'est
 * pas une date exploitable ne declenche aucun prorata (on facture le trimestre
 * plein, comportement d'origine), plutot que de minorer sur une supposition.
 */
export function normaliserDateISO(valeur: string | null | undefined): string | null {
  if (typeof valeur !== "string") return null;
  const debut = valeur.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(debut) ? debut : null;
}

/** Part de trimestre reellement couverte par le mandat. */
export interface Prorata {
  /** Jours couverts, bornes incluses. 0 = prise en gestion apres le trimestre. */
  jours: number;
  /** Jours du trimestre entier. */
  joursTrimestre: number;
  /** jours / joursTrimestre, dans [0, 1]. */
  ratio: number;
}

/**
 * Prorata a appliquer au trimestre, ou `null` si le trimestre est plein.
 *
 * Null couvre les deux cas normaux : date inconnue / illisible, et prise en
 * gestion anterieure au trimestre (le mandat couvre tout le trimestre).
 */
export function prorataTrimestre(
  periode: string,
  priseEnGestion: string | null | undefined,
): Prorata | null {
  const bornes = bornesTrimestre(periode);
  const debutMandat = normaliserDateISO(priseEnGestion);
  if (!debutMandat) return null;
  if (debutMandat <= bornes.debut) return null; // mandat deja en cours : trimestre plein
  if (debutMandat > bornes.fin) {
    // Prise en gestion posterieure au trimestre : rien n'est du sur ce trimestre.
    return { jours: 0, joursTrimestre: bornes.jours, ratio: 0 };
  }
  const jours = (jourUTC(bornes.fin) - jourUTC(debutMandat)) / 86_400_000 + 1;
  return { jours, joursTrimestre: bornes.jours, ratio: jours / bornes.jours };
}

/** Ce que le contrat prevoit pour le trimestre. */
export interface AttenduTrimestre {
  honorairesHt: number;
  timbres: number;
  totalHt: number;
  /** Trimestre plein au contrat, avant prorata (sert au recap de fournee). */
  totalPleinHt: number;
  /** Renseigne uniquement si un prorata s'applique. */
  prorata?: Prorata;
}

/** Entree du contrat, telle que le depot la fournit. */
export interface ContratTrimestre {
  /** Honoraires annuels TTC. `null` ou <= 0 = contrat non renseigne. */
  honorairesAnnuelsTtc: number | null;
  /** Forfait de frais postaux annuel (sans TVA). */
  forfaitPostauxAnnuel: number;
  /** Vrai = frais postaux refactures au reel : pas de forfait de timbres. */
  fraisPostauxReels: boolean;
  /** Date de prise en gestion (ISO ou timestamp ISO). Null si inconnue. */
  priseEnGestion?: string | null;
}

/**
 * Attendu du trimestre au contrat : annuel / 4, au prorata des jours couverts si
 * la copro a ete prise en gestion en cours de trimestre.
 *
 * Le prorata porte AUSSI sur les timbres : le forfait postal est un forfait de
 * trimestre, pas un droit d'entree.
 */
export function attenduTrimestre(contrat: ContratTrimestre, periode: string): AttenduTrimestre {
  const annuel = contrat.honorairesAnnuelsTtc ?? 0;
  const honorairesPleinHt = htDepuisTtc(annuel / 4);
  const timbresPlein = contrat.fraisPostauxReels ? 0 : contrat.forfaitPostauxAnnuel / 4;
  const totalPleinHt = honorairesPleinHt + timbresPlein;

  const prorata = prorataTrimestre(periode, contrat.priseEnGestion);
  const ratio = prorata ? prorata.ratio : 1;
  const honorairesHt = honorairesPleinHt * ratio;
  const timbres = timbresPlein * ratio;

  return {
    honorairesHt,
    timbres,
    totalHt: honorairesHt + timbres,
    totalPleinHt,
    ...(prorata ? { prorata } : {}),
  };
}

/** Une ligne du trimestre soumise au filet. */
export interface EntreeFilet extends ContratTrimestre {
  coproCode: string;
  /** Montant HT reellement propose a la facturation (honoraires + timbres). */
  montantHt: number;
  /** Vrai si la gestion courante de ce trimestre a deja ete facturee. */
  dejaFacture: boolean;
  /** Date (ISO) de cette facture deja emise, si connue. */
  dejaFactureLe?: string | null;
}

/** Ce que le filet dit d'une ligne. */
export interface VerdictFilet {
  coproCode: string;
  verdict: VerdictLigne;
  montantHt: number;
  attendu: AttenduTrimestre;
  /** montant - attendu, en euros (positif = surfacturation). */
  ecartHt: number;
  /** Ecart relatif, ou null si l'attendu est nul (ratio indefini). */
  ecartPct: number | null;
  /** Prorata applique, s'il y en a un (sert au badge « prorata (X jours) »). */
  prorata?: Prorata;
  /** Date de la facture deja emise sur ce trimestre, si `deja_facturee`. */
  dejaFactureLe?: string;
  /** Cochee par « Tout selectionner » ? Vrai UNIQUEMENT sans alerte. */
  selectionnableEnMasse: boolean;
  /** Cochee par le geste explicite « selectionner aussi les alertes » ? */
  selectionnableAvecAlertes: boolean;
  /** Exige que la comptable tape « facturer » pour cette ligne. */
  exigeConfirmationEcrite: boolean;
  /** Peut-elle partir, une fois selectionnee (et confirmee le cas echeant) ? */
  emissible: boolean;
}

/** Arrondi au centime : les seuils se jugent sur des euros, pas sur du bruit flottant. */
function centimes(montant: number): number {
  return Math.round(montant * 100) / 100;
}

/**
 * Verdict d'une ligne. L'ordre des tests est significatif :
 *   1. deja facturee -> on ne regarde meme pas les montants, la ligne est morte ;
 *   2. contrat absent / a 0 -> aucun attendu opposable, rien ne part ;
 *   3. seuils de surfacturation (le plus grave d'abord) ;
 *   4. sous-facturation ;
 *   5. conforme -- badge « prorata » si la copro est reprise en cours de trimestre.
 *
 * Le prorata n'est PAS une alerte : il est porte separement (champ `prorata`) et
 * reste attache a la ligne meme quand un autre verdict s'applique, pour que le
 * badge « prorata (X jours) » explique le montant dans tous les cas.
 */
export function verdictLigne(entree: EntreeFilet, periode: string): VerdictFilet {
  const attendu = attenduTrimestre(entree, periode);
  const montantHt = entree.montantHt;
  const ecartHt = montantHt - attendu.totalHt;
  const ecartPct = attendu.totalHt > 0 ? ecartHt / attendu.totalHt : null;

  const base = {
    coproCode: entree.coproCode,
    montantHt,
    attendu,
    ecartHt,
    ecartPct,
    ...(attendu.prorata ? { prorata: attendu.prorata } : {}),
  };

  if (entree.dejaFacture) {
    return {
      ...base,
      verdict: "deja_facturee",
      ...(entree.dejaFactureLe ? { dejaFactureLe: entree.dejaFactureLe } : {}),
      selectionnableEnMasse: false,
      selectionnableAvecAlertes: false,
      exigeConfirmationEcrite: false,
      emissible: false,
    };
  }

  const honoraires = entree.honorairesAnnuelsTtc;
  if (honoraires === null || honoraires === undefined || honoraires <= 0) {
    return {
      ...base,
      verdict: "contrat_absent",
      selectionnableEnMasse: false,
      selectionnableAvecAlertes: false,
      exigeConfirmationEcrite: false,
      emissible: false,
    };
  }

  const montant = centimes(montantHt);
  const cible = centimes(attendu.totalHt);
  const seuil20 = centimes(attendu.totalHt * (1 + SEUIL_CONFIRMATION_ECRITE));
  const seuil10 = centimes(attendu.totalHt * (1 + SEUIL_ALERTE));

  // Attendu nul (prise en gestion posterieure au trimestre) : tout montant non nul
  // est une surfacturation sans reference. On exige la confirmation ecrite.
  if (cible <= 0) {
    if (montant > TOLERANCE_EUROS) {
      return {
        ...base,
        verdict: "alerte_20",
        selectionnableEnMasse: false,
        selectionnableAvecAlertes: false,
        exigeConfirmationEcrite: true,
        emissible: true,
      };
    }
    // Rien n'est du et rien n'est propose : la ligne est saine, mais elle n'a
    // aucune raison de partir (facture a 0 EUR). On la sort de la fournee.
    return {
      ...base,
      verdict: attendu.prorata ? "prorata" : "ok",
      selectionnableEnMasse: false,
      selectionnableAvecAlertes: false,
      exigeConfirmationEcrite: false,
      emissible: false,
    };
  }

  if (montant > seuil20) {
    return {
      ...base,
      verdict: "alerte_20",
      selectionnableEnMasse: false,
      selectionnableAvecAlertes: false,
      exigeConfirmationEcrite: true,
      emissible: true,
    };
  }

  // Le seuil de +10 % est INCLUSIF : exactement +10 % est deja une alerte orange.
  if (montant >= seuil10) {
    return {
      ...base,
      verdict: "alerte_10",
      selectionnableEnMasse: false,
      selectionnableAvecAlertes: true,
      exigeConfirmationEcrite: false,
      emissible: true,
    };
  }

  if (montant < cible - TOLERANCE_EUROS) {
    return {
      ...base,
      verdict: "sous_facturation",
      selectionnableEnMasse: false,
      selectionnableAvecAlertes: true,
      exigeConfirmationEcrite: false,
      emissible: true,
    };
  }

  return {
    ...base,
    verdict: attendu.prorata ? "prorata" : "ok",
    selectionnableEnMasse: true,
    selectionnableAvecAlertes: true,
    exigeConfirmationEcrite: false,
    emissible: true,
  };
}

/** Recapitulatif de la fournee sur le point de partir (dernier regard global). */
export interface RecapFournee {
  nbCopros: number;
  /** Ce qui va reellement partir, HT. */
  totalHt: number;
  /** Ce que le contrat prevoit pour ces memes copros (prorata inclus), HT. */
  totalAttenduHt: number;
  /** Le trimestre PLEIN au contrat, avant prorata : situe l'effet des reprises. */
  totalContratPleinHt: number;
  /** totalHt - totalAttenduHt. */
  ecartHt: number;
}

/** Agrege les lignes retenues pour l'ecran de confirmation d'emission. */
export function recapFournee(lignes: VerdictFilet[]): RecapFournee {
  const totalHt = lignes.reduce((s, l) => s + l.montantHt, 0);
  const totalAttenduHt = lignes.reduce((s, l) => s + l.attendu.totalHt, 0);
  const totalContratPleinHt = lignes.reduce((s, l) => s + l.attendu.totalPleinHt, 0);
  return {
    nbCopros: lignes.length,
    totalHt,
    totalAttenduHt,
    totalContratPleinHt,
    ecartHt: totalHt - totalAttenduHt,
  };
}
