// Une PROPOSITION de contrat de syndic : un prospect, son immeuble, un prix, un statut.
// C'est le debut de la chaine (ADR-039) : ce qui est « elu » ici devient une reprise,
// une fiche App A, un client Pennylane, un contrat.
//
// Les statuts et les origines sont ceux de l'Excel « Suivi Proposition reprise syndic »
// (1 161 lignes depuis 2012), normalises. Fonctions pures.

export const STATUTS_PROPOSITION = [
  "en_cours",
  "accepte_cs",
  "elu",
  "refuse_cs",
  "refuse_ag",
  "refuse_real31",
  "reporte",
] as const;
export type StatutProposition = (typeof STATUTS_PROPOSITION)[number];

/** Ton du badge de statut (meme couleur dans la liste et sur la fiche). */
export const TON_STATUT: Record<StatutProposition, "ok" | "warn" | "err" | "neutral" | "info"> = {
  en_cours: "info",
  accepte_cs: "warn",
  reporte: "neutral",
  elu: "ok",
  refuse_cs: "err",
  refuse_ag: "err",
  refuse_real31: "neutral",
};

export const LIBELLE_STATUT: Record<StatutProposition, string> = {
  en_cours: "En cours",
  accepte_cs: "Accepté par le CS",
  elu: "Élu",
  refuse_cs: "Refusé par le CS",
  refuse_ag: "Refusé par l'AG",
  refuse_real31: "Refusé par REAL 31",
  reporte: "Reporté",
};

/** Les statuts ou il reste quelque chose a faire. */
export const STATUTS_OUVERTS: ReadonlySet<StatutProposition> = new Set(["en_cours", "accepte_cs", "reporte"]);

export const ORIGINES = ["bouche_a_oreille", "vitrine", "internet", "deja_client", "autre"] as const;
export type Origine = (typeof ORIGINES)[number];

export const LIBELLE_ORIGINE: Record<Origine, string> = {
  bouche_a_oreille: "Bouche à oreille",
  vitrine: "Vitrine / pub",
  internet: "Internet",
  deja_client: "Déjà client",
  autre: "Autre / non connue",
};

/** La fiche de visite du cabinet (« Notes visite copropriete pour offre »), telle quelle. */
export interface Immeuble {
  adresse: string;
  codePostal?: string;
  commune?: string;
  /** Numero d'immatriculation au registre national, si retrouve. */
  immatriculation?: string;
  lotsPrincipaux?: number;
  lotsStationnement?: number;
  coproprietaires?: number;
  cagesEscalier?: number;
  ascenseurs?: number;
  portesGarage?: number;
  chauffageCollectif?: boolean;
  /** « societe » / « employe » / « autre ». */
  menage?: string;
  employesImmeuble?: number;
  gardiens?: number;
  /** Visites prevues au contrat (1 minimum). */
  visitesPrevues?: number;
  /** Reunions de CS complementaires prevues. */
  csPrevus?: number;
  periodeConstruction?: string;
  /** L'assureur du syndicat et la date de souscription, s'ils sont connus (ils vont au contrat). */
  assurance?: string;
  assuranceDateISO?: string;
  syndicActuel?: string;
  finMandatActuelISO?: string;
  prochaineAgISO?: string;
  clotureComptable?: string;
  litiges?: string;
  notes?: string;
}

export interface Contact {
  nom?: string;
  /** Membre du CS, president, coproprietaire, syndic benevole... */
  role?: string;
  telephone?: string;
  email?: string;
}

/** Le prix : la grille telle qu'elle a ete calculee, et ce que le gestionnaire retient. */
export interface Prix {
  /** Honoraires annuels TTC retenus (le montant du contrat et du mail) = grille - geste. */
  honorairesTtc?: number;
  /**
   * Le geste commercial, en euros TTC par an, deduit de la grille (Sekou, 15/09/2026 : on
   * garde le prix de base, avec la possibilite d'un geste). Negatif = majoration.
   */
  gesteCommercialTtc?: number;
  timbresTtc?: number;
  /** La grille au moment du calcul, pour la trace interne. */
  grilleTtc?: number;
  grilleTimbresTtc?: number;
  anneeGrille?: number;
  /** Frais postaux au reel (defaut pour une offre) ou forfait timbres. */
  fraisPostauxReels?: boolean;
}

export interface EntreeJournalProposition {
  quandISO: string;
  par: string;
  texte: string;
}

export interface Proposition {
  id: string;
  statut: StatutProposition;
  /** Code agence (ML, LGC, HLS...). */
  agence?: string;
  /** Nom du gestionnaire qui porte la proposition (rôles plus tard). */
  gestionnaire?: string;
  origine?: Origine;
  immeuble: Immeuble;
  contact: Contact;
  prix: Prix;
  premierContactISO?: string;
  remisePropositionISO?: string;
  agPrevueISO?: string;
  /** Date de la decision (election ou refus). */
  decisionISO?: string;
  commentaires?: string;
  /** Code de la copro une fois elue et reprise. */
  coproCode?: string;
  journal: EntreeJournalProposition[];
  creeParNom: string;
  creeLeISO: string;
  majLeISO: string;
}

/**
 * Ce qu'il manque pour faire une offre : la liste que la saisie rapide affiche a
 * celui qui prend l'appel (« quelle info prendre »).
 */
/**
 * Ce qui manque a une proposition. Deux niveaux : `contact` = de quoi rappeler et chiffrer
 * (adresse, lots, nom, un moyen de joindre) ; `offre` ajoute ce qu'il faut pour rediger
 * l'offre elle-meme (syndic en place, prochaine AG, cloture). Le pipeline n'affiche que le
 * premier niveau, sinon chaque ligne reprise de l'Excel serait « incomplete ».
 */
export function informationsManquantes(p: Pick<Proposition, "immeuble" | "contact">, niveau: "contact" | "offre" = "offre"): string[] {
  const m: string[] = [];
  if (!p.immeuble.adresse?.trim()) m.push("l'adresse de l'immeuble");
  if (!p.immeuble.lotsPrincipaux) m.push("le nombre de lots principaux");
  if (!p.contact.nom?.trim()) m.push("le nom du contact");
  if (!p.contact.telephone?.trim() && !p.contact.email?.trim()) m.push("un téléphone ou un e-mail");
  if (niveau === "contact") return m;
  if (!p.immeuble.prochaineAgISO) m.push("la date de la prochaine AG");
  if (!p.immeuble.clotureComptable?.trim()) m.push("la date de clôture comptable");
  return m;
}

/** Normalise un statut tel qu'il est ecrit dans l'Excel (casse et espaces variables). */
export function statutDepuisLibelle(brut: string | null | undefined): StatutProposition | null {
  const s = (brut ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("accept")) return "accepte_cs";
  if (s === "elu" || s === "élu") return "elu";
  if (s.startsWith("en cours")) return "en_cours";
  if (s.startsWith("report")) return "reporte";
  if (s.includes("real")) return "refuse_real31";
  if (s.includes("ag")) return "refuse_ag";
  if (s.includes("cs")) return "refuse_cs";
  if (s.startsWith("refus")) return "refuse_cs";
  return null;
}

export function origineDepuisLibelle(brut: string | null | undefined): Origine | undefined {
  const s = (brut ?? "").trim().toLowerCase();
  if (!s || s === "nc") return undefined;
  if (s.startsWith("bouche")) return "bouche_a_oreille";
  if (s.startsWith("vitrine")) return "vitrine";
  if (s.startsWith("internet")) return "internet";
  if (s.startsWith("d")) return "deja_client";
  return "autre";
}

/** « DE_2001_A_2010 » (registre national) -> « de 2001 à 2010 ». */
export function libellePeriodeConstruction(brut: string): string {
  return brut.toLowerCase().replace(/_/g, " ").replace(/a/g, "à");
}
