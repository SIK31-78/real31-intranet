// Les prestations particulieres du contrat de syndic que la facturation ne couvrait pas
// (Sekou, 15/09/2026 : « on n'en a que 5, mais certaines se facturent au lot, d'autres
// a l'heure, d'autres fixes »). Le catalogue vient du contrat type lui-meme (§ 7.2 et 8,
// gabarit du cabinet) : c'est la que le mode de calcul et l'imputation sont ecrits.
//
// Les 5 gestes du quotidien (depassement CS, suivi travaux, suivi sinistre, pre-etat
// date, etat date) gardent leurs services dedies ; ici, tout le reste, par un seul
// calcul : quantite x tarif unitaire, avec majoration eventuelle.
//
// MYTHEC ne facturait AUCUNE de ces prestations (le flow FacturationSyndic n'aiguille que
// 5 cas). Elles partaient a la main dans Pennylane : le recouvrement sur le produit
// « Relance sur charges impayees » (verifie sur les factures de juin-aout 2026), le
// reste, par defaut, sur « Honoraires complementaires ».
// Fonctions pures.

import { htDepuisTtc } from "./commun";
import {
  CATEGORIE_HONORAIRES_COMPLEMENTAIRES,
  CATEGORIE_RELANCE_CHARGES,
} from "./produits";

/** Comment la prestation se compte. */
export type ModeTarif =
  /** Un montant, point. */
  | "fixe"
  /** Tarif x nombre de lots principaux de la copro (pre-rempli depuis la fiche). */
  | "par_lot"
  /** Tarif x nombre de coproprietaires concernes. */
  | "par_coproprietaire"
  /** Taux horaire x heures, a la demi-heure, toute demi-heure commencee due. */
  | "horaire";

/** A qui le contrat impute la prestation. La facture part TOUJOURS au syndicat (client
 *  Pennylane = la copro, comme l'etat date) ; l'imputation dit si le nom du coproprietaire
 *  concerne doit figurer sur la ligne, pour que le syndicat refacture. */
export type Imputation = "syndicat" | "coproprietaire";

export const GROUPES_PRESTATION = [
  "reunions",
  "administratif",
  "emprunt",
  "recouvrement",
  "mutations",
  "temps_passe",
] as const;
export type GroupePrestation = (typeof GROUPES_PRESTATION)[number];

export const LIBELLE_GROUPE: Record<GroupePrestation, string> = {
  reunions: "Réunions et visites supplémentaires",
  administratif: "Administratif et juridique",
  emprunt: "Emprunt du syndicat",
  recouvrement: "Recouvrement (imputable au copropriétaire)",
  mutations: "Mutations et copies (imputable au copropriétaire)",
  temps_passe: "Au temps passé",
};

export interface PrestationContrat {
  /** Cle stable (sert dans les formulaires et les details de facture). */
  code: string;
  /** Identifiant au bareme (`intranet_tarifs.identifiant_prestation`). */
  identifiantPrestation: string;
  /** Libelle imprime sur la facture, tel que le contrat le nomme. */
  libelle: string;
  mode: ModeTarif;
  imputation: Imputation;
  groupe: GroupePrestation;
  categorieProduit: string;
  /** Article du contrat, pour l'infobulle. */
  article: string;
}

export const PRESTATIONS_CONTRAT: ReadonlyArray<PrestationContrat> = [
  // --- 7.2.2 Reunions et visites supplementaires --------------------------------------
  { code: "ag_supplementaire", identifiantPrestation: "AGE", libelle: "Assemblée générale supplémentaire", mode: "par_lot", imputation: "syndicat", groupe: "reunions", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.2" },
  { code: "visite_supplementaire", identifiantPrestation: "VisiteSupp", libelle: "Visite supplémentaire de la copropriété", mode: "fixe", imputation: "syndicat", groupe: "reunions", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.2" },
  // --- 7.2.3 / 7.2.6 / 7.2.7 Administratif et juridique -------------------------------
  { code: "publication_edd_rcp", identifiantPrestation: "ModifRCP", libelle: "Publication de l'EDD / RCP ou de leurs modifications", mode: "par_lot", imputation: "syndicat", groupe: "administratif", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.3" },
  { code: "dossier_avocat", identifiantPrestation: "DossierAvocat", libelle: "Constitution du dossier transmis à l'avocat, à l'huissier ou à l'assureur protection juridique", mode: "fixe", imputation: "syndicat", groupe: "administratif", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.6" },
  { code: "reprise_comptabilite", identifiantPrestation: "RepriseCompta", libelle: "Reprise de la comptabilité sur exercice(s) antérieur(s)", mode: "par_lot", imputation: "syndicat", groupe: "administratif", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.7" },
  { code: "immatriculation_initiale", identifiantPrestation: "ImmatInitiale", libelle: "Immatriculation initiale du syndicat", mode: "fixe", imputation: "syndicat", groupe: "administratif", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.7" },
  // --- 7.2.7 Emprunt ---------------------------------------------------------------------
  { code: "dossier_emprunt", identifiantPrestation: "DossierEmprunt", libelle: "Constitution et suivi du dossier d'emprunt (art. 26-4 al. 1 et 2)", mode: "par_coproprietaire", imputation: "syndicat", groupe: "emprunt", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.7" },
  { code: "dossier_emprunt_iii", identifiantPrestation: "DossierEmpruntIII", libelle: "Constitution et suivi du dossier d'emprunt (art. 26-4 III)", mode: "par_coproprietaire", imputation: "syndicat", groupe: "emprunt", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.7" },
  { code: "gestion_emprunt_iii", identifiantPrestation: "DossierEmpruntIIIGestion", libelle: "Gestion de l'emprunt souscrit au nom du syndicat (art. 26-4 III)", mode: "par_coproprietaire", imputation: "syndicat", groupe: "emprunt", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.7" },
  // --- 8.1 Recouvrement (imputable au seul coproprietaire) -----------------------------
  { code: "mise_en_demeure", identifiantPrestation: "MED", libelle: "Mise en demeure par lettre recommandée avec accusé de réception", mode: "fixe", imputation: "coproprietaire", groupe: "recouvrement", categorieProduit: CATEGORIE_RELANCE_CHARGES, article: "8.1" },
  { code: "relance_apres_med", identifiantPrestation: "MED", libelle: "Relance après mise en demeure", mode: "fixe", imputation: "coproprietaire", groupe: "recouvrement", categorieProduit: CATEGORIE_RELANCE_CHARGES, article: "8.1" },
  { code: "protocole_accord", identifiantPrestation: "Echeancier", libelle: "Conclusion d'un protocole d'accord par acte sous seing privé", mode: "fixe", imputation: "coproprietaire", groupe: "recouvrement", categorieProduit: CATEGORIE_RELANCE_CHARGES, article: "8.1" },
  { code: "hypotheque", identifiantPrestation: "Hypotheque", libelle: "Frais de constitution ou de mainlevée d'hypothèque", mode: "fixe", imputation: "coproprietaire", groupe: "recouvrement", categorieProduit: CATEGORIE_RELANCE_CHARGES, article: "8.1" },
  { code: "injonction_payer", identifiantPrestation: "Injonction", libelle: "Dépôt d'une requête en injonction de payer", mode: "fixe", imputation: "coproprietaire", groupe: "recouvrement", categorieProduit: CATEGORIE_RELANCE_CHARGES, article: "8.1" },
  { code: "dossier_justice", identifiantPrestation: "DossierJustice", libelle: "Constitution du dossier transmis à l'auxiliaire de justice", mode: "fixe", imputation: "coproprietaire", groupe: "recouvrement", categorieProduit: CATEGORIE_RELANCE_CHARGES, article: "8.1" },
  // --- 8.2 / 8.3 Mutations et copies (imputable au seul coproprietaire) ----------------
  { code: "opposition_mutation", identifiantPrestation: "Opposition", libelle: "Opposition sur mutation (art. 20 I de la loi du 10 juillet 1965)", mode: "fixe", imputation: "coproprietaire", groupe: "mutations", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "8.2" },
  { code: "delivrance_copie", identifiantPrestation: "DelivranceCopie", libelle: "Délivrance de documents sur support papier", mode: "fixe", imputation: "coproprietaire", groupe: "mutations", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "8.3" },
  // --- 7.2.1 Au temps passe --------------------------------------------------------------
  { code: "temps_passe", identifiantPrestation: "TauxHoraire", libelle: "Prestation au temps passé (suivi du dossier avocat, dossier de subvention, structure extérieure…)", mode: "horaire", imputation: "syndicat", groupe: "temps_passe", categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES, article: "7.2.1" },
];

export function prestationContrat(code: string): PrestationContrat | undefined {
  return PRESTATIONS_CONTRAT.find((p) => p.code === code);
}

/** Majorations prevues au contrat, en fraction. */
export const MAJORATIONS = {
  /** 7.2.4 : prestations hors jours et heures ouvrables rendues necessaires par l'urgence. */
  urgence: 0.4,
} as const;

export interface EntreePrestation {
  prestation: PrestationContrat;
  /** Tarif unitaire TTC au bareme (ou fige au contrat). */
  tarifTtc: number;
  /** Lots, coproprietaires ou heures selon le mode ; ignore pour `fixe`. */
  quantite?: number;
  /** Majoration d'urgence (temps passe hors heures ouvrables). */
  urgence?: boolean;
}

export interface CalculPrestation {
  quantite: number;
  /** Ce que represente la quantite, pour l'ecran (« lots principaux », « heures »…). */
  unite: string | null;
  unitaireTtc: number;
  unitaireHt: number;
  majorationPct: number;
  montantHt: number;
  montantTtc: number;
}

/** Arrondit une duree a la demi-heure SUPERIEURE (7.2.1 : toute demi-heure commencee est due). */
export function arrondirDemiHeure(heures: number): number {
  return Math.ceil(heures * 2 - 1e-9) / 2;
}

const UNITES: Record<ModeTarif, string | null> = {
  fixe: null,
  par_lot: "lot(s) principal(aux)",
  par_coproprietaire: "copropriétaire(s)",
  horaire: "heure(s)",
};

/**
 * Montant d'une prestation du catalogue. Leve si la quantite manque pour un mode qui en
 * demande une, ou si elle n'est pas positive : on ne facture pas zero lot en silence.
 */
export function calculerPrestation(e: EntreePrestation): CalculPrestation {
  const { prestation } = e;
  let quantite = 1;
  if (prestation.mode !== "fixe") {
    if (e.quantite === undefined || !Number.isFinite(e.quantite) || e.quantite <= 0) {
      throw new Error(`${prestation.libelle} : indiquer le nombre de ${UNITES[prestation.mode]}.`);
    }
    quantite = prestation.mode === "horaire" ? arrondirDemiHeure(e.quantite) : Math.round(e.quantite);
  }
  const majorationPct = e.urgence && prestation.mode === "horaire" ? MAJORATIONS.urgence : 0;
  const unitaireTtc = e.tarifTtc * (1 + majorationPct);
  const unitaireHt = htDepuisTtc(unitaireTtc);
  const montantTtc = Math.round(unitaireTtc * quantite * 100) / 100;
  return {
    quantite,
    unite: UNITES[prestation.mode],
    unitaireTtc,
    unitaireHt,
    majorationPct,
    montantHt: Math.round(unitaireHt * quantite * 100) / 100,
    montantTtc,
  };
}
