// Module « Gestion des clés » (ADR-040, 18/09/2026) : les types du domaine, purs.
//
// Le TROUSSEAU est l'unite pretee ; sa COMPOSITION (cles, badges, bips) sert au controle
// du retour, pas a un suivi unitaire. Un ACCES dit ce que le trousseau ouvre : un BIEN
// (une copropriete aujourd'hui ; un lot locatif ou un bien en vente plus tard, Sekou 18/09)
// plus un immeuble facultatif et des types d'acces. Un PRET est le cycle sortie -> retour ;
// une RESERVATION est un souhait independant de l'etat physique ; un MOUVEMENT est une
// ligne de journal qu'on ne reecrit jamais.
//
// AUCUN ETAT n'est stocke sur le trousseau hors la marque (introuvable, retire) : l'etat
// se derive (cf. etat.ts). C'est le defaut PowerApps (statut ecrasable) qu'on ne reconduit pas.

export const AGENCES_CLES = ["ML", "LGC", "HLS", "ASN"] as const;

export const TYPES_ELEMENT = ["cle", "badge", "bip", "telecommande", "pass", "autre"] as const;
export type TypeElement = (typeof TYPES_ELEMENT)[number];

export const LIBELLE_TYPE_ELEMENT: Record<TypeElement, string> = {
  cle: "clé",
  badge: "badge",
  bip: "bip",
  telecommande: "télécommande",
  pass: "pass",
  autre: "autre",
};

export interface ElementComposition {
  type: TypeElement;
  /** Ex. « porte hall », « Vigik », « parking ». Peut etre vide. */
  libelle: string;
  quantite: number;
}

/** Les types d'acces de l'outil PowerApps (colonne AccessType), plus « secours » et « hall » qui vivaient dans les libelles. */
export const TYPES_ACCES = [
  "total",
  "secours",
  "hall",
  "local_eau",
  "local_fibre",
  "local_velo",
  "local_encombrants",
  "parking",
  "chaufferie",
  "local_electrique",
  "toiture",
  "caves",
  "jardin",
  "autre",
] as const;
export type TypeAcces = (typeof TYPES_ACCES)[number];

export const LIBELLE_TYPE_ACCES: Record<TypeAcces, string> = {
  total: "Accès total",
  secours: "Accès secours",
  hall: "Hall",
  local_eau: "Local eau",
  local_fibre: "Local fibre",
  local_velo: "Local vélo",
  local_encombrants: "Local encombrants",
  parking: "Parking",
  chaufferie: "Chaufferie",
  local_electrique: "Local électrique",
  toiture: "Toiture",
  caves: "Caves",
  jardin: "Jardin",
  autre: "Autre",
};

/**
 * Ce qu'un acces ouvre. Aujourd'hui une copropriete ; les autres formes sont reservees
 * (gestion locative, transaction) et ne sont pas construites. Rien hors de l'adapter ne
 * doit supposer « trousseau = copro ».
 */
export type Bien =
  | { type: "copro"; code: string; nom?: string }
  | { type: "lot_locatif"; ref: string; nom?: string }
  | { type: "bien_vente"; ref: string; nom?: string };

export interface Acces {
  id: string;
  bien: Bien;
  /** Immeuble / batiment / cage : libelle libre (ou nom du Building ESTALE), facultatif. */
  immeuble?: string;
  types: TypeAcces[];
  libelle: string;
  /** 0 = le bien principal du trousseau. */
  ordre: number;
}

export const MARQUES = ["introuvable", "retire"] as const;
export type Marque = (typeof MARQUES)[number];

export type SourceCles = "intranet" | "import_powerapps";

export interface Trousseau {
  id: string;
  agenceCode: string;
  /** R004, J045 : unique par agence. */
  numero: string;
  libelle: string;
  /** Tiroir / armoire, ex. « T041 ». */
  emplacement?: string;
  composition: ElementComposition[];
  /** Chemin dans le bucket Storage « cles » ; l'URL signee se calcule a l'affichage. */
  photoChemin?: string;
  marque?: Marque;
  marqueDepuisISO?: string;
  /** Un autre trousseau, double de celui-ci. */
  jumeauDe?: string;
  note?: string;
  source: SourceCles;
  creeParNom: string;
  creeLeISO: string;
  acces: Acces[];
}

export interface Contact {
  nom: string;
  telephone?: string;
  email?: string;
  principal?: boolean;
}

export interface AdresseEntreprise {
  ligne1?: string;
  ligne2?: string;
  codePostal?: string;
  ville?: string;
}

export type StatutEntreprise = "active" | "bloquee";

export interface Entreprise {
  id: string;
  nom: string;
  nomNormalise: string;
  telephone?: string;
  email?: string;
  adresse?: AdresseEntreprise;
  contacts: Contact[];
  note?: string;
  statut: StatutEntreprise;
  motifBlocage?: string;
  /** Recoit les mails de relance (opt-out a la main de l'agence). */
  relances: boolean;
  estaleSupplierId?: string;
  source: SourceCles;
  creeLeISO: string;
}

/** « expiree » n'est jamais stocke : c'est `prevue` avec un debut passe (cf. etat.ts). */
export type StatutReservation = "prevue" | "convertie" | "annulee";
export type OrigineReservation = "interne" | "externe";

export interface Reservation {
  id: string;
  trousseauId: string;
  entrepriseId?: string;
  /** Nom de l'entreprise au moment de la lecture (jointure), pour l'affichage. */
  entrepriseNom?: string;
  contact?: Contact;
  debutISO: string;
  finPrevueISO: string;
  motif?: string;
  origine: OrigineReservation;
  statut: StatutReservation;
  pretId?: string;
  annuleeLeISO?: string;
  annuleePar?: string;
  motifAnnulation?: string;
  creeParNom: string;
  creeLeISO: string;
}

export type TypePret = "entreprise" | "interne";
export type ConformiteRetour = "complet" | "incomplet" | "endommage";

export const LIBELLE_CONFORMITE: Record<ConformiteRetour, string> = {
  complet: "Complet",
  incomplet: "Incomplet",
  endommage: "Endommagé",
};

export interface Pret {
  id: string;
  trousseauId: string;
  type: TypePret;
  entrepriseId?: string;
  entrepriseNom?: string;
  /** Snapshot a la sortie : la fiche entreprise peut changer ensuite, pas le pret. */
  contact?: Contact;
  /** Snapshot a la sortie : ce contre quoi le retour est controle. */
  composition: ElementComposition[];
  reservationId?: string;
  motif?: string;
  /** Horodatage serveur ISO complet. */
  sortiLeISO: string;
  sortiParId?: string;
  sortiParNom: string;
  /** Jour ISO « AAAA-MM-JJ ». */
  retourPrevuLeISO: string;
  renduLeISO?: string;
  recuParId?: string;
  recuParNom?: string;
  retourConforme?: ConformiteRetour;
  commentaireRetour?: string;
  photoRetourChemin?: string;
}

export const TYPES_MOUVEMENT = [
  "creation",
  "modification",
  "composition_modifiee",
  "reservation",
  "annulation_reservation",
  "sortie",
  "prolongation",
  "retour",
  "introuvable",
  "retrouve",
  "retrait",
  "correction",
  "relance",
  "import",
] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

export interface Mouvement {
  id: string;
  trousseauId: string;
  type: TypeMouvement;
  horodatageISO: string;
  parUserId?: string;
  parNom: string;
  agenceCode: string;
  entrepriseId?: string;
  entrepriseNom?: string;
  pretId?: string;
  reservationId?: string;
  corrigeId?: string;
  /** Avant/apres, motif, conformite, incoherence d'import… libre mais serialisable. */
  details: Record<string, unknown>;
}

/** L'etat AFFICHE d'un trousseau : derive, jamais stocke (cf. etat.ts). */
export type EtatTrousseau = "en_agence" | "reserve" | "sorti" | "en_retard" | "introuvable" | "retire";

export const LIBELLE_ETAT: Record<EtatTrousseau, string> = {
  en_agence: "En agence",
  reserve: "Réservé",
  sorti: "Sorti",
  en_retard: "En retard",
  introuvable: "Introuvable",
  retire: "Retiré",
};

/** Ton de pastille par etat : le vert de marque n'est jamais un statut (design system). */
export const TON_ETAT: Record<EtatTrousseau, "ok" | "info" | "warn" | "err" | "neutral"> = {
  en_agence: "ok",
  reserve: "info",
  sorti: "warn",
  en_retard: "err",
  introuvable: "err",
  retire: "neutral",
};
