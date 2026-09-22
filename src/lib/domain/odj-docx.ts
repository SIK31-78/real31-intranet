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

/** Les balises du gabarit, une par blanc pre-remplissable. Noms = ceux du .docx. */
export interface DonneesOdjCsDocx {
  adresse: string;
  dateCs: string;
  heureCs: string;
  equipeSyndic: string;
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
  travauxIntitule: string;
  travauxBudget: string;
  travauxDepenses: string;
  debiteurs: string;
  fondsTravaux: string;
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
  membresCs: string;
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

function valeur(odj: Odj, id: string): string {
  for (const c of [...odj.enTete, ...odj.sections.flatMap((s) => s.champs)]) {
    if (c.id === id && !c.masque) return formatChampValeur(c) ?? "";
  }
  return "";
}

function brute(odj: Odj, id: string): string | undefined {
  for (const c of [...odj.enTete, ...odj.sections.flatMap((s) => s.champs)]) {
    if (c.id === id && !c.masque) return c.valeur;
  }
  return undefined;
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

function pointApplicable(odj: Odj, id: string): boolean {
  const p = odj.pointsLegaux.find((x) => x.id === id);
  return p ? p.applicable : false;
}

export function donneesDocxOdjCs(
  odj: Odj,
  options: { heureCs?: string; heureAg?: string } = {},
): DonneesOdjCsDocx {
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

  const budgetPropose = parseMontant(brute(odj, "points.budget-n1"));

  const irve = pointApplicable(odj, "irve");
  const velo = pointApplicable(odj, "local-velo");

  return {
    adresse: odj.copro.adresse,
    dateCs: valeur(odj, "date-cs"),
    heureCs: heureFrancaise(options.heureCs),
    equipeSyndic: valeur(odj, "presents-syndic") || "Gestionnaire et assistant",
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
    travauxIntitule: valeur(odj, "travaux.intitule"),
    travauxBudget: valeur(odj, "travaux.budget-vote"),
    travauxDepenses: valeur(odj, "travaux.depenses"),
    debiteurs: valeur(odj, "comptes.debiteurs"),
    fondsTravaux: valeur(odj, "comptes.fonds-travaux"),
    exercicePrecedent: anneeAg ? String(anneeAg - 1) : "",
    gazDebut: gaz.debut,
    gazFin: gaz.fin,
    gazPrix: "",
    elecDebut: elec.debut,
    elecFin: elec.fin,
    elecPrix: "",
    anneeBudget: anneeAg ? String(anneeAg + 1) : "20XX",
    budgetPropose: budgetPropose === null ? "….." : formatEuros(budgetPropose).replace(/\s?€$/, ""),
    contratSyndicActuel: valeur(odj, "points.contrat-syndic-actuel"),
    membresCs: valeur(odj, "points.renouvellement-cs"),
    ppt: pointApplicable(odj, "ppt"),
    dpe: pointApplicable(odj, "dpe-collectif"),
    irve,
    velo,
    stationnement: irve || velo,
    agHybride: pointApplicable(odj, "ag-hybride"),
    locationTouristique: pointApplicable(odj, "location-touristique"),
  };
}
