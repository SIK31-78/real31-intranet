// Types du domaine "patrimoine" d'une reprise de copropriete eStale.
// Source de verite metier : 10_Estale/10_Reprise copropriete/CLAUDE.md (regles cabinet)
// + les 3 procedures du vault. Ces types refletent EXACTEMENT les colonnes des
// fichiers .xlsx attendus par eStale ; ils ne dependent d'aucun framework.

/** Usage d'un lot : LISTE FERMEE eStale (colonne "Usage" de lots.xlsx). */
export const USAGES = [
  "residential",
  "office",
  "commercial",
  "mixed",
  "parking",
  "other",
] as const;
export type Usage = (typeof USAGES)[number];

/**
 * Civilites owners : LISTE FERMEE STRICTE (R5). "autre" N'EXISTE PAS.
 * SCI sans gerant -> "m". Toute valeur hors liste = erreur a l'import eStale.
 */
export const CIVILITES = [
  "m",
  "mme",
  "mm",
  "mmes",
  "m&mme",
  "m|mme",
  "doctor",
  "doctors",
  "master",
  "masters",
  "professor",
  "professors",
  "indivision",
  "inheritance",
  "sdc",
] as const;
export type Civilite = (typeof CIVILITES)[number];

/** Un lot (lots.xlsx : N° Lot | Type | Usage | Escalier | Etage | Porte | Surface | Nb Piece | Commentaire). */
export interface Lot {
  /** Entier > 0, = EDD final. Ne JAMAIS renumeroter (trous de numerotation normaux). */
  numero: number;
  /** Texte <= 100 car, libelles homogenes. */
  type: string;
  usage: Usage;
  /** <= 10 car, vide si absent. */
  escalier?: string;
  /** Entier : RDC = 0, sous-sol = -1. */
  etage?: number;
  /** <= 10 car. */
  porte?: string;
  /** Surface en m2. */
  surface?: number;
  nbPiece?: number;
  /** <= 256 car, OBLIGATOIRE (description RCP fidele ; vide + signale si absente). */
  commentaire: string;
}

/** Une cle de repartition (definie cote eStale ; total fait foi via capture). */
export interface Cle {
  /** 3 chiffres minimum, prefixe par 0 : "001", "100", "101", "200"... */
  code: string;
  /** <= 80 car (limite eStale) : le libelle STRICT du RCP/de la compta, pas une paraphrase. */
  libelle: string;
  /** Total attendu (somme EDD). */
  totalAttendu: number;
  /** Cle des charges communes generales (cochee "Defaut" cote eStale). */
  defaut?: boolean;
  /** <= 500 car. Precision complementaire si le libelle RCP depasse 80 car (rare). */
  commentaire?: string;
}

/**
 * Une ligne de tantieme (tantiemes_<code>.xlsx : N° Lot | Tantieme).
 * Un fichier par cle. Lot non concerne par une cle -> OMIS (jamais 0).
 */
export interface Tantieme {
  cleCode: string;
  lot: number;
  /** Entier > 0, valeur EXACTE de l'EDD final. */
  valeur: number;
}

/**
 * Un copropriétaire (owners.xlsx, 22 colonnes - ordre du template eStale fait foi).
 * On type les champs porteurs de regles ; le reste suit a l'implementation xlsx.
 */
export interface Owner {
  /** Identifiant interne stable (relie les attributions avant l'attribution des codes eStale). */
  id: string;
  civilite: Civilite;
  /** MAJUSCULES, <= 38 car, obligatoire. */
  nom: string;
  /** Title Case. Couple : "Prenom Mr & Prenom Mme" (chacun Title Case). */
  prenom?: string;
  /** Pro = Oui/Non (personne morale / SCI). */
  pro: boolean;
  /** DD/MM/YYYY ou vide. */
  naissance?: string;
  /** 1 seule adresse, <= 100 car. */
  email?: string;
  /** Occupant Oui/Non/vide. */
  occupant?: boolean | null;
  /** <= 100 car. */
  lieuNaissance?: string;
  /** <= 100 car ("France" par defaut cote nationalite si voulu). */
  nationalite?: string;
  /** <= 20 car. */
  telPortable?: string;
  /** <= 20 car. */
  telFixe?: string;
  // --- Adresse postale (souvent completee manuellement en P5) ---
  adrNum?: string;
  adrVoie?: string;
  adrComplement?: string;
  adrCodePostal?: string;
  adrVille?: string;
  /** "France" par defaut. */
  paysAdresse?: string;
  // --- Personne morale / SCI ---
  /** <= 10 car. */
  formeJuridique?: string;
  /** <= 38 car. */
  raisonSociale?: string;
  /** <= 14 car. */
  siren?: string;
  /** Chiffre > 0 (eStale refuse un capital non numerique). */
  capital?: number;
  /** <= 100 car. */
  commentaire?: string;
}

/**
 * Attribution d'un lot a un copropriétaire (links.xlsx).
 * Phase A (DRAFT) : on relie par ownerId (NOM en clair). Phase B : codeEstale rempli (ref 4-car).
 */
export interface Attribution {
  ownerId: string;
  lot: number;
  /** Phase B : code 4 caracteres attribue par eStale. */
  codeEstale?: string;
}

/**
 * Statut de la liaison d'un owner vers son compte 450 (coproprietaire) de l'ancien syndic :
 *   - "lie"        : un compte 450 unique apparie fortement et sans ambiguite -> attache ;
 *   - "ambigu"     : plusieurs candidats plausibles (ou homonymes cote grand livre) -> a trancher ;
 *   - "non_trouve" : aucun compte 450 apparie de facon fiable.
 */
export type StatutLiaison = "lie" | "ambigu" | "non_trouve";

/** Un compte 450 candidat pour un owner (PII-free : numero + score, jamais de nom). */
export interface CandidatLiaison {
  /** Numero de compte 450 du grand livre (ex. "4501.100489139"). */
  compteSource: string;
  /** Score d'appariement 0..1. */
  confiance: number;
}

/**
 * Liaison owner <-> compte 450 de l'ancien syndic (issue de l'analyse UNIFIEE patrimoine + compta).
 * C'est la CLE deterministe de la reprise comptable : une fois l'owner injecte, son compte 450
 * source est connu -> l'attribution de la compta ne passe plus par l'appariement par nom (les
 * homonymes se distinguent par leur compte). PII-free : ne porte que l'ownerId (identifiant
 * interne) et des numeros de compte, jamais de nom (le nom vit dans owners, affiche en UI).
 */
export interface LiaisonOwnerCompte {
  /** Owner.id vise (identifiant interne stable, PII-free). */
  ownerId: string;
  statut: StatutLiaison;
  /** Compte 450 attache (present si "lie", ou choisi par l'humain lors de la revue). */
  compteSource?: string;
  /** Score du meilleur candidat (0..1). */
  confiance?: number;
  /** Candidats plausibles (>= 1) quand "ambigu". */
  candidats?: CandidatLiaison[];
  /** true si le compte apparie appartient a un groupe homonyme cote grand livre. */
  groupeHomonyme?: boolean;
  /** true si la liaison a ete tranchee par un humain (le statut reflete alors son choix). */
  tranchee?: boolean;
}

/** Jeu de donnees complet d'une copro, produit par l'extraction et verifie par les auto-checks. */
export interface JeuDeDonnees {
  lots: Lot[];
  cles: Cle[];
  tantiemes: Tantieme[];
  owners: Owner[];
  attributions: Attribution[];
  /**
   * Liaison owners <-> comptes 450 de l'ancien syndic, produite par l'analyse UNIFIEE quand un
   * grand livre est fourni. Champ ADDITIF, optionnel : absent pour les jeux extraits SANS grand
   * livre (parcours patrimoine seul) -> rehydratation d'un jeu ancien sans erreur (JSONB souple).
   */
  liaisons450?: LiaisonOwnerCompte[];
}
