// ODJ du CS en WORD : projection de l'Odj (get-odj) vers les balises du gabarit
// src/lib/adapters/docx/gabarits/odj-cs.docx, qui est le modele Word du cabinet balise.
//
// Decision Sekou 2026-09-22 : les collegues remplissent le CS dans LEUR Word (en reunion),
// l'intranet ne fait que PRE-REMPLIR ce que ESTALE / le referentiel savent. Tout ce qui
// se decide en seance reste un blanc dans le document, comme dans le modele d'origine.
//
// Regle de rendu d'un blanc : une valeur inconnue rend "" (le libelle reste, le blanc
// aussi, le gestionnaire ecrit dedans). Jamais "undefined", jamais un placeholder.
// Domaine PUR : aucune I/O, testable sans gabarit.

import type { Odj } from "./odj";
import { ecartMontants, formatChampValeur, parseMontant } from "./odj";
import { formatEuros } from "./format-montant";
import {
  formatTaux,
  propositionFraisPostaux,
  proposerContratSyndic,
  type TauxBareme,
} from "./proposition-contrat-syndic";

/** Un chantier vote, rendu en BLOC REPETE dans le document (retour Sekou 2026-09-23 :
 *  plusieurs chantiers sur une seule ligne etaient illisibles). */
export interface TravauxDocx {
  libelle: string;
  budgetVote: string;
  depenses: string;
}

/** Les balises du gabarit, une par blanc pre-remplissable. Noms = ceux du .docx. */
export interface DonneesOdjCsDocx {
  adresse: string;
  dateCs: string;
  heureCs: string;
  equipeSyndic: string;
  /** Tous les membres du CS : on RAYE les absents en seance (demande Sekou). */
  presentsCs: string;
  dateAg: string;
  heureAg: string;
  lieuAg: string;
  modeAg: string;
  dateLimitePoints: string;
  dateMiseSousPli: string;
  depenses: string;
  budget: string;
  ecartLibelle: string;
  ecart: string;
  /** Un bloc par chantier ; vide = le bloc entier disparait. */
  travaux: TravauxDocx[];
  debiteurs: string;
  /** Les memes gros debiteurs, rappeles au point "Dossier procedure". */
  debiteursProcedure: string;
  fondsTravaux: string;
  interetsLivret: string;
  exercicePrecedent: string;
  gazDebut: string;
  gazFin: string;
  gazPrix: string;
  elecDebut: string;
  elecFin: string;
  elecPrix: string;
  anneeBudget: string;
  budgetPropose: string;
  contratSyndicActuel: string;
  contratSyndicPropose: string;
  /** "soit une augmentation de 2 % (bareme 2027)" ; vide si rien a proposer. */
  hausseContrat: string;
  /** Rappel de l'option frais postaux au reel ; vide si la copro y est deja. */
  propositionFraisPostaux: string;
  membresCs: string;
  /** Candidats au renouvellement = les membres actuels ; on retire en seance. */
  candidatsCs: string;
  /** Sections legales : false = le bloc entier disparait du document. */
  ppt: boolean;
  dpe: boolean;
  irve: boolean;
  velo: boolean;
  /** Chapeau des deux points stationnement : present si l'un des deux l'est. */
  stationnement: boolean;
  agHybride: boolean;
  locationTouristique: boolean;
}

/** Ce que le modele Word ecrit quand la donnee n'est pas connue : le blanc d'origine. */
const MODE_AG_INCONNU = "présentiel / hybride (présentiel et visio)";

function champDe(odj: Odj, id: string) {
  return [...odj.enTete, ...odj.sections.flatMap((s) => s.champs)].find((c) => c.id === id && !c.masque);
}

function valeur(odj: Odj, id: string): string {
  const c = champDe(odj, id);
  return c ? (formatChampValeur(c) ?? "") : "";
}

function brute(odj: Odj, id: string): string | undefined {
  return champDe(odj, id)?.valeur;
}

/**
 * Le contrat gaz / electricite est rendu par get-odj en UNE chaine
 * "Libelle (du 01/01/2025 au 31/12/2026)". Le modele Word veut deux blancs (effet / fin).
 * On les extrait ; si la chaine n'a pas cette forme, le libelle entier va dans "effet".
 */
export function bornesContrat(chaine: string | undefined): { debut: string; fin: string } {
  if (!chaine) return { debut: "", fin: "" };
  const m = chaine.match(/\(du (\d{2}\/\d{2}\/\d{4}) au (\d{2}\/\d{2}\/\d{4})\)/);
  if (m) return { debut: m[1]!, fin: m[2]! };
  const depuis = chaine.match(/\(depuis le (\d{2}\/\d{2}\/\d{4})\)/);
  if (depuis) return { debut: depuis[1]!, fin: "" };
  const jusqu = chaine.match(/\(jusqu'au (\d{2}\/\d{2}\/\d{4})\)/);
  if (jusqu) return { debut: "", fin: jusqu[1]! };
  return { debut: chaine, fin: "" };
}

/** "18:30" -> "18h30" (le modele ecrit les heures a la francaise). */
export function heureFrancaise(hhmm: string | undefined): string {
  if (!hhmm) return "";
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? `${m[1]}h${m[2]}` : hhmm;
}

/** "2026-09-23" -> "23/09/2026". */
function dateFr(iso: string | undefined): string {
  if (!iso) return "";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return a && m && j ? `${j}/${m}/${a}` : "";
}

/**
 * Les GROS debiteurs seulement (plus de 5 % du budget annuel), un par ligne, avec la date
 * a laquelle les comptes ont ete consultes : "M. KOMA : 1 200,00 € (au 23/09/2026)".
 * Format demande par Sekou le 2026-09-23 - le CS doit pouvoir dater l'information.
 */
export function debiteursImportants(
  debiteurs: { nom: string; montant: number; depasse5pct: boolean }[] | undefined,
  dateConsultationISO: string,
): string {
  const gros = (debiteurs ?? []).filter((d) => d.depasse5pct);
  if (gros.length === 0) return "";
  const le = dateFr(dateConsultationISO);
  return gros.map((d) => `${d.nom} : ${formatEuros(d.montant)}${le ? ` (au ${le})` : ""}`).join("\n");
}

function pointApplicable(odj: Odj, id: string): boolean {
  const p = odj.pointsLegaux.find((x) => x.id === id);
  return p ? p.applicable : false;
}

/** Montant TTC en toutes lettres du modele : "4 800,00 €", ou "" si inconnu. */
function euros(montant: number | null | undefined): string {
  return montant === null || montant === undefined ? "" : formatEuros(montant);
}

export interface OptionsOdjCsDocx {
  heureCs?: string;
  heureAg?: string;
  /** Debiteurs ESTALE bruts : le modele veut les GROS, dates. */
  debiteurs?: { nom: string; montant: number; depasse5pct: boolean }[];
  /** Jour de lecture des comptes, ISO (injecte : le domaine ne lit pas l'horloge). */
  dateConsultationISO?: string;
  /** Chantiers votes (ESTALE), rendus en blocs repetes. */
  travauxVotes?: { libelle: string; budgetVote: number; depenses: number }[];
  /** Honoraires du contrat de gestion en cours, TTC. */
  contratSyndicTtc?: number;
  /** Budget de l'exercice SUIVANT s'il est deja vote. */
  budgetSuivant?: number;
  /** Interets generes par le livret du fonds travaux sur l'exercice precedent. */
  interetsLivret?: number;
  /** Taux de revalorisation du bareme de l'annee suivante (ex 0.02), s'il est ouvert. */
  tauxBaremeSuivant?: TauxBareme | null;
  /** La copro est-elle deja aux frais postaux reels ? */
  fraisPostauxReels?: boolean;
}

export function donneesDocxOdjCs(odj: Odj, options: OptionsOdjCsDocx = {}): DonneesOdjCsDocx {
  const budgetBrut = brute(odj, "comptes.budget");
  const depensesBrut = brute(odj, "comptes.depenses-courantes");
  // Sans objet : le modele ecrit deja "cela represente un ... de".
  const ecart = ecartMontants(budgetBrut, depensesBrut);

  const visio = brute(odj, "visio");
  const modeAg = visio === "oui" ? "hybride (présentiel et visio)" : visio === "non" ? "présentiel" : MODE_AG_INCONNU;

  const gaz = bornesContrat(brute(odj, "gestion.gaz"));
  const elec = bornesContrat(brute(odj, "gestion.electricite"));

  // Exercice precedent = annee de l'AG - 1 (l'AG approuve l'exercice clos).
  const anneeAg = odj.dateAgISO ? Number(odj.dateAgISO.slice(0, 4)) : undefined;

  // Budget N+1 : l'exercice suivant s'il est vote, sinon la saisie du gestionnaire.
  const budgetPropose = options.budgetSuivant ?? parseMontant(brute(odj, "points.budget-n1"));

  const debiteurs = debiteursImportants(options.debiteurs, options.dateConsultationISO ?? "");

  // Le CS renouvelle : on repropose les membres en place, on retire en seance.
  const membresCs = valeur(odj, "points.renouvellement-cs");

  // Renouvellement du contrat : le bareme de l'annee suivante donne la hausse, le contrat
  // en cours donne la base. Sans l'un des deux, on laisse le blanc du modele.
  const proposition = proposerContratSyndic(options.contratSyndicTtc, options.tauxBaremeSuivant ?? null);

  const irve = pointApplicable(odj, "irve");
  const velo = pointApplicable(odj, "local-velo");

  return {
    adresse: odj.copro.adresse,
    dateCs: valeur(odj, "date-cs"),
    heureCs: heureFrancaise(options.heureCs),
    equipeSyndic: valeur(odj, "presents-syndic") || "Gestionnaire et assistant",
    presentsCs: valeur(odj, "presents-cs") || "M/MME",
    dateAg: valeur(odj, "date-ag"),
    heureAg: heureFrancaise(options.heureAg) || "18h00",
    lieuAg: valeur(odj, "lieu"),
    modeAg,
    dateLimitePoints: valeur(odj, "limite-odj"),
    dateMiseSousPli: valeur(odj, "mise-sous-pli"),
    depenses: valeur(odj, "comptes.depenses-courantes"),
    budget: valeur(odj, "comptes.budget"),
    // Sans ecart calculable, on garde la formulation du modele (les deux cas, a rayer).
    ecartLibelle: ecart ? `un ${ecart.libelle.toLowerCase()}` : "un trop-perçu / un dépassement",
    ecart: ecart ? ecart.valeur : "",
    travaux: (options.travauxVotes ?? []).map((t) => ({
      libelle: t.libelle,
      budgetVote: euros(t.budgetVote),
      depenses: euros(t.depenses),
    })),
    debiteurs,
    debiteursProcedure: debiteurs,
    fondsTravaux: valeur(odj, "comptes.fonds-travaux"),
    interetsLivret: euros(options.interetsLivret),
    exercicePrecedent: anneeAg ? String(anneeAg - 1) : "",
    gazDebut: gaz.debut,
    gazFin: gaz.fin,
    gazPrix: "",
    elecDebut: elec.debut,
    elecFin: elec.fin,
    elecPrix: "",
    anneeBudget: anneeAg ? String(anneeAg + 1) : "20XX",
    budgetPropose: budgetPropose === null || budgetPropose === undefined ? "" : formatEuros(budgetPropose),
    contratSyndicActuel: euros(options.contratSyndicTtc) || valeur(odj, "points.contrat-syndic-actuel"),
    contratSyndicPropose: proposition
      ? formatEuros(proposition.montantTtc)
      : valeur(odj, "points.contrat-syndic-proposition"),
    hausseContrat: proposition
      ? `soit une augmentation de ${formatTaux(proposition.taux)}${anneeAg ? ` (barème ${anneeAg + 1})` : ""}`
      : "",
    propositionFraisPostaux: propositionFraisPostaux(options.fraisPostauxReels),
    membresCs,
    candidatsCs: membresCs,
    ppt: pointApplicable(odj, "ppt"),
    dpe: pointApplicable(odj, "dpe-collectif"),
    irve,
    velo,
    stationnement: irve || velo,
    agHybride: pointApplicable(odj, "ag-hybride"),
    locationTouristique: pointApplicable(odj, "location-touristique"),
  };
}
