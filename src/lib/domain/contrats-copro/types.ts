// Module « Contrats & contrôles » (REA-333, plan docs/plan-integration-suivi-contrats-copros.md).
// Types PURS du domaine : les quatre sujets de suivi d'une copropriété (assurance multirisque,
// contrat gaz, contrôle technique quinquennal des ascenseurs, contrôle de la VMC gaz), leurs
// cycles, offres, devis, appareils, documents, la fiche immeuble et les règles de relance.
//
// Vocabulaire tranché le 16/10/2026 : un CYCLE est un renouvellement (ou un contrôle) en cours,
// avec une ÉCHÉANCE et des ÉTAPES datées ; dater la TERMINALE clôt le cycle et en ouvre un
// suivant. Le NIVEAU (vert / orange / rouge) dit si le dossier est FIGÉ, pas si l'échéance est
// proche : il se calcule, il ne se stocke jamais (cf. qualification.ts).
//
// Les données vivent dans les tables de l'ancienne application (gardées telles quelles,
// décision 5) : seul l'adapter connaît leurs noms ; ici tout est en français et en ISO.

export const SUJETS = ["assurance", "gaz", "ctq_ascenseur", "ctq_vmc"] as const;
export type SujetSuivi = (typeof SUJETS)[number];

export const LIBELLE_SUJET: Record<SujetSuivi, string> = {
  assurance: "Assurance",
  gaz: "Contrat gaz",
  ctq_ascenseur: "CTQ ascenseur",
  ctq_vmc: "CTQ VMC gaz",
};

/** Libellé long, pour un titre de section ou un objet de mail. */
export const LIBELLE_SUJET_LONG: Record<SujetSuivi, string> = {
  assurance: "Assurance multirisque immeuble",
  gaz: "Contrat de fourniture de gaz",
  ctq_ascenseur: "Contrôle technique quinquennal des ascenseurs",
  ctq_vmc: "Contrôle quinquennal de la VMC gaz",
};

export type StatutCycle = "en_cours" | "clos" | "archive";

export const LIBELLE_STATUT_CYCLE: Record<StatutCycle, string> = {
  en_cours: "En cours",
  clos: "Terminé",
  archive: "Archivé",
};

/** Les trois niveaux du cron historique, plus l'état « à compléter » (pas d'échéance saisie). */
export type Niveau = "vert" | "orange" | "rouge";
export type NiveauQualifie = Niveau | "a_completer";

export const LIBELLE_NIVEAU: Record<NiveauQualifie, string> = {
  vert: "Vert",
  orange: "Orange",
  rouge: "Rouge",
  a_completer: "À compléter",
};

// --- Étapes ------------------------------------------------------------------------------

export interface EtapeDef {
  /** Clé stable (celle du journal et de l'adapter), ex. "offres_demandees". */
  cle: string;
  libelle: string;
  /** La TERMINALE clôt le cycle et ouvre le suivant (une seule par sujet). */
  terminale?: boolean;
  /** Étape POSTÉRIEURE à la terminale (CTQ : transmission à l'entreprise) : ne compte ni
   *  dans la progression ni dans le niveau. */
  postTerminale?: boolean;
}

const ETAPES_CTQ: readonly EtapeDef[] = [
  { cle: "devis_demande", libelle: "Devis demandé" },
  { cle: "devis_recu", libelle: "Devis reçu" },
  { cle: "devis_presente", libelle: "Devis présenté" },
  { cle: "devis_valide", libelle: "Devis validé" },
  { cle: "ctq_realise", libelle: "Contrôle réalisé", terminale: true },
  { cle: "transmis_entreprise", libelle: "Transmis à l'entreprise", postTerminale: true },
  { cle: "devis_entreprise_obtenu", libelle: "Devis entreprise obtenu", postTerminale: true },
];

/** Les étapes de chaque sujet, dans l'ordre métier (ordre de saisie libre). */
export const ETAPES: Record<SujetSuivi, readonly EtapeDef[]> = {
  assurance: [
    { cle: "sinistralite_demandee", libelle: "Relevé de sinistralité demandé" },
    { cle: "sinistralite_recue", libelle: "Relevé de sinistralité reçu" },
    { cle: "offres_demandees", libelle: "Offres demandées" },
    { cle: "offres_recues", libelle: "Offres reçues" },
    { cle: "offres_presentees", libelle: "Offres présentées" },
    { cle: "validee", libelle: "Offre validée", terminale: true },
  ],
  gaz: [
    { cle: "devis_demande", libelle: "Devis demandé" },
    { cle: "devis_recu", libelle: "Devis reçu" },
    { cle: "devis_presente", libelle: "Devis présenté" },
    { cle: "validee", libelle: "Offre validée", terminale: true },
  ],
  ctq_ascenseur: ETAPES_CTQ,
  ctq_vmc: ETAPES_CTQ,
};

export function etapeTerminale(sujet: SujetSuivi): EtapeDef {
  return ETAPES[sujet].find((e) => e.terminale)!;
}

/** Les étapes qui comptent pour la progression et le niveau (ni terminale, ni post-terminale). */
export function etapesIntermediaires(sujet: SujetSuivi): EtapeDef[] {
  return ETAPES[sujet].filter((e) => !e.terminale && !e.postTerminale);
}

// --- Cycles ------------------------------------------------------------------------------

/** Dates d'étapes d'un cycle : clé d'étape -> jour ISO "YYYY-MM-DD". Absente = non franchie. */
export type DatesEtapes = Partial<Record<string, string>>;

export interface Cycle {
  id: string;
  sujet: SujetSuivi;
  coproCode: string;
  /** CTQ ascenseur : l'appareil suivi (un cycle par ascenseur). */
  ascenseurId?: string;
  /** CTQ ascenseur : identifiant de l'appareil, pour l'affichage. */
  ascenseurIdentifiant?: string | null;
  statut: StatutCycle;
  /** Échéance du cycle, jour ISO ; null = à compléter. */
  echeanceISO: string | null;
  etapes: DatesEtapes;
  /** true = démarré par un clic « Démarrer le suivi » ; null = cycle d'amorçage. */
  demarreManuellement: boolean | null;
  /** Assurance et gaz : l'offre retenue à la validation. */
  offreRetenueId?: string | null;
  /** Assurance : notes libres du tableau de bord historique. */
  notes?: string | null;
  creeLeISO: string;
}

export type NouveauCycle = Omit<Cycle, "id" | "creeLeISO" | "ascenseurIdentifiant">;

// --- Appareils ---------------------------------------------------------------------------

export interface Ascenseur {
  id: string;
  coproCode: string;
  /** Référence de l'appareil chez l'ascensoriste (peut manquer). */
  identifiant: string | null;
  /** Date du dernier contrôle quinquennal, jour ISO. */
  dernierCtqISO: string | null;
  notes?: string | null;
}

export type NouvelAscenseur = Omit<Ascenseur, "id">;

// --- Offres et devis ---------------------------------------------------------------------

export type TypePrixGaz = "variable" | "fixe";

export const LIBELLE_TYPE_PRIX_GAZ: Record<TypePrixGaz, string> = { variable: "Variable", fixe: "Fixe" };

export interface OffreAssurance {
  id: string;
  cycleId: string;
  assureur: string;
  /** Prime annuelle proposée, en euros. */
  prime: number;
  /** Franchise, en euros. */
  franchise: number;
  garanties: string | null;
  recueLeISO: string | null;
  /** Suppression logique (décision du 16/10) : la ligne reste, elle ne s'affiche plus. */
  supprimeeLeISO?: string | null;
}

export interface OffreGaz {
  id: string;
  cycleId: string;
  fournisseur: string;
  typePrix: TypePrixGaz;
  /** Montant annuel, en euros. */
  montant: number;
  /** Durée du contrat proposé, en mois : pilote l'échéance suivante. */
  dureeMois: number;
  recueLeISO: string | null;
  supprimeeLeISO?: string | null;
}

export type SujetCtq = "ctq_ascenseur" | "ctq_vmc";

/** Un devis de contrôle, rattaché à la COPRO (un devis couvre l'immeuble), par sujet. */
export interface DevisCtq {
  id: string;
  coproCode: string;
  sujet: SujetCtq;
  prestataire: string;
  montant: number;
  recueLeISO: string | null;
  supprimeeLeISO?: string | null;
}

export type NouvelleOffreAssurance = Omit<OffreAssurance, "id" | "supprimeeLeISO">;
export type NouvelleOffreGaz = Omit<OffreGaz, "id" | "supprimeeLeISO">;
export type NouveauDevisCtq = Omit<DevisCtq, "id" | "supprimeeLeISO">;

// --- Le contrat courant (porté par la copropriété) ---------------------------------------

/** Ce que la copropriété SAIT de ses contrats en cours, hors cycles : la vérité du jour. */
export interface ContratCourant {
  coproCode: string;
  assurance: {
    compagnie: string | null;
    numeroContrat: string | null;
    courtier: string | null;
    souscriptionISO: string | null;
    echeanceISO: string | null;
    /** Prime actuelle (fiche immeuble), en euros. */
    prime: number | null;
  };
  gaz: {
    fournisseur: string | null;
    typePrix: TypePrixGaz | null;
    montant: number | null;
    echeanceISO: string | null;
  };
  vmc: {
    societe: string | null;
    reference: string | null;
    dernierCtqISO: string | null;
  };
  /** Compteurs déclaratifs : 0 = pas concerné, null = jamais renseigné. */
  compteurs: {
    ascenseurs: number | null;
    chaudieres: number | null;
    vmcGaz: number | null;
  };
  /** Énergie de chauffage (fiche immeuble) : "GAZ", "FIOUL", "ELECTRICITE"… ; null si inconnue. */
  energieChauffage: string | null;
  /** Devis CTQ retenus, par sujet (null = aucun). */
  devisRetenu: Record<SujetCtq, string | null>;
}

/** Les champs du contrat courant qu'un geste peut corriger (tous optionnels : patch). */
export interface PatchContratCourant {
  assurance?: Partial<Omit<ContratCourant["assurance"], "prime">> & { prime?: number | null };
  gaz?: Partial<ContratCourant["gaz"]>;
  vmc?: Partial<ContratCourant["vmc"]>;
  compteurs?: Partial<ContratCourant["compteurs"]>;
}

// --- Documents (pointeurs SharePoint) ----------------------------------------------------

export const TYPES_DOCUMENT = [
  "offre",
  "devis",
  "conditions_particulieres",
  "conditions_generales",
  "releve_sinistralite",
  "rapport_ctq",
  "autre",
] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const LIBELLE_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  offre: "Offre",
  devis: "Devis",
  conditions_particulieres: "Conditions particulières",
  conditions_generales: "Conditions générales",
  releve_sinistralite: "Relevé de sinistralité",
  rapport_ctq: "Rapport de contrôle",
  autre: "Autre",
};

/** Rattachement EXCLUSIF d'un document : exactement une des cibles. */
export type RattachementDocument =
  | { type: "copro"; coproCode: string }
  | { type: "cycle_assurance"; cycleId: string }
  | { type: "offre_assurance"; offreId: string }
  | { type: "offre_gaz"; offreId: string }
  | { type: "devis_ctq"; devisId: string };

export interface DocumentContrat {
  id: string;
  sujet: SujetSuivi;
  typeDocument: TypeDocument;
  nomAffiche: string;
  nomFichier: string;
  mime: string;
  tailleOctets: number;
  /** Identifiants SharePoint (Graph) du fichier. */
  driveId: string;
  itemId: string;
  webUrl: string | null;
  deposeParId: string;
  deposeLeISO: string;
  rattachement: RattachementDocument;
  /** Le fichier reste dans SharePoint ; le pointeur est seulement masqué. */
  supprimeLeISO?: string | null;
}

export type NouveauDocumentContrat = Omit<DocumentContrat, "id" | "supprimeLeISO">;

// --- Prestataires de la copropriété ------------------------------------------------------

/** Les métiers d'une entreprise du référentiel cabinet qui comptent ici. */
export const METIERS_PRESTATAIRE = ["ascensoriste", "societe_vmc", "courtier", "fournisseur_gaz", "organisme_controle", "assureur"] as const;
export type MetierPrestataire = (typeof METIERS_PRESTATAIRE)[number];

export const LIBELLE_METIER: Record<MetierPrestataire, string> = {
  ascensoriste: "Ascensoriste",
  societe_vmc: "Société VMC",
  courtier: "Courtier en assurance",
  fournisseur_gaz: "Fournisseur de gaz",
  organisme_controle: "Organisme de contrôle",
  assureur: "Assureur",
};

/** Un prestataire rattaché à une copropriété, par métier (reprend l'ancien carnet). */
export interface PrestataireCopro {
  coproCode: string;
  entrepriseId: string;
  entrepriseNom: string;
  metier: MetierPrestataire;
  /** Le contact principal de ce métier pour la copro (un seul par métier). */
  principal: boolean;
  email: string | null;
}

// --- Règles de relance -------------------------------------------------------------------

export interface RegleRelance {
  sujet: SujetSuivi;
  /** Jours avant l'échéance où la fenêtre de suivi s'ouvre (180, 90, 120…). */
  premierRappelJours: number;
  /** Jours sans étape franchie avant l'orange. */
  orangeJours: number;
  /** Jours sans étape franchie avant le rouge. */
  rougeJours: number;
  /** Cadence des rappels par mail, en jours. */
  cadenceJours: number;
}

/** Valeurs de départ (celles de la base au 15/10/2026) ; l'écran /admin/relances les change. */
export const REGLES_RELANCE_DEFAUT: Record<SujetSuivi, RegleRelance> = {
  assurance: { sujet: "assurance", premierRappelJours: 180, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
  gaz: { sujet: "gaz", premierRappelJours: 90, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
  ctq_ascenseur: { sujet: "ctq_ascenseur", premierRappelJours: 120, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
  ctq_vmc: { sujet: "ctq_vmc", premierRappelJours: 120, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
};

// --- Journal -----------------------------------------------------------------------------

export const TYPES_JOURNAL = [
  "etape_datee",
  "etape_effacee",
  "suivi_demarre",
  "cycle_clos",
  "cycle_recloture",
  "offre_creee",
  "offre_retiree",
  "offre_retenue",
  "devis_cree",
  "devis_retire",
  "devis_retenu",
  "contrat_corrige",
  "appareil_cree",
  "appareil_modifie",
  "document_depose",
  "document_retire",
  "mail_cs_envoye",
  "rappel_envoye",
  "suivi_archive",
  "immeuble_modifie",
  "prestataire_lie",
  "prestataire_delie",
] as const;
export type TypeJournal = (typeof TYPES_JOURNAL)[number];

export interface EntreeJournalContrats {
  id: string;
  coproCode: string;
  sujet: SujetSuivi | null;
  cycleId: string | null;
  type: TypeJournal;
  horodatageISO: string;
  parUserId: string | null;
  parNom: string;
  /** Avant / après, montant, destinataires… ce qui rend la ligne lisible. */
  details: Record<string, unknown>;
}

export type NouvelleEntreeJournal = Omit<EntreeJournalContrats, "id" | "horodatageISO">;

// --- Fiche immeuble (registre national des copropriétés) --------------------------------

export type TriEtat = "oui" | "non" | "non_connue";

export interface FicheImmeuble {
  coproCode: string;
  surfaceM2: number | null;
  anneeConstruction: number | null;
  periodeConstruction: string | null;
  nombreBatiments: number | null;
  /** Chauffage : type (INDIVIDUEL, COLLECTIF, MIXTE, SANS_CHAUFFAGE…), énergie, système. */
  chauffageType: string | null;
  chauffageEnergie: string | null;
  chauffageSysteme: string | null;
  /** Eau chaude sanitaire. */
  ecsType: string | null;
  ecsSysteme: string | null;
  ecsMemeQueChauffage: boolean | null;
  ventilationType: string | null;
  ventilationSysteme: string | null;
  bornesRechargeVE: TriEtat | null;
  locauxVelos: TriEtat | null;
  dpeCollectifRealise: TriEtat | null;
  diagnosticStructureRealise: TriEtat | null;
  pptInscritAG: TriEtat | null;
  pptVote: TriEtat | null;
  pptAdoptionISO: string | null;
  primeAssuranceActuelle: number | null;
  notes: string | null;
  batiments: Batiment[];
}

export interface Batiment {
  id: string;
  coproCode: string;
  nom: string;
  anneeConstruction: number | null;
  nombreEtages: number | null;
  nombreAscenseurs: number | null;
  /** Étiquette énergie A à G, ou "NON_DETERMINE". */
  etiquetteEnergie: string | null;
}

export type NouveauBatiment = Omit<Batiment, "id">;
export type PatchFicheImmeuble = Partial<Omit<FicheImmeuble, "coproCode" | "batiments">>;
