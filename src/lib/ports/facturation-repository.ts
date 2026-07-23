// Port (contrat) de la facturation des honoraires de syndic (tables natives
// intranet_tarifs / intranet_suivi_contrats / intranet_factures / intranet_facture_lignes).
//
// Le CALCUL des montants vit dans le domaine (lib/domain/facturation) ; ce port
// ne porte que la resolution du bareme et la persistance. Ne depend d'aucune
// techno (ni Supabase, ni Pennylane).

/** Types de prestation SYNDIC facturables (cf. intranet_factures.type_prestation). */
export type TypePrestation =
  | "depassement_cs"
  | "suivi_travaux"
  | "suivi_sinistre"
  | "pre_etat_date"
  | "etat_date"
  | "depassement_ag"
  | "gestion_courante";

export type StatutFacture = "a_facturer" | "facturee" | "erreur";

/** Contrat de gestion courante d'une copropriete. */
export interface ContratCopro {
  id: string;
  coproCode: string;
  /** Debut du contrat, ISO "YYYY-MM-DD". Son annee determine le bareme applicable. */
  debutContrat: string;
  honorairesGestionTtc?: number;
  forfaitPostauxTtc?: number;
}

/** Ligne a facturer. Montant HT, aligne sur les invoice_lines Pennylane. */
export interface LigneFactureInput {
  /** Detail affiche sous le titre (dates, heures, diligence...). */
  description: string;
  /** Categorie de produit (cf. domain/facturation/produits) : resout le libelle,
   *  le product_id et le compte comptable selon l'agence de la copro a l'emission. */
  categorieProduit?: string;
  quantite: number;
  prixUnitaireHt: number;
  /** Defaut : 0.20 (cote base). */
  tauxTva?: number;
}

/** Produit de facturation (liste Produits), par (categorie, agence). */
export interface Produit {
  categorie: string;
  agence: string;
  /** Libelle affiche sur la facture, ex "Honoraires gestion courante LGC". */
  titre: string;
  pennylaneProductId: string;
  /** Compte comptable de produits (rattachement compta). */
  ledgerAccountId: string;
}

export interface NouvelleFacture {
  /** Code copro (referenceCrypto), cle logique dans intranet_factures. */
  coproCode: string;
  typePrestation: TypePrestation;
  libelle: string;
  /** ISO "YYYY-MM-DD". */
  dateFacture: string;
  /** ISO "YYYY-MM-DD". */
  datePrestation?: string;
  /** Periode de facturation (ex "2026-T3"), pour la gestion courante uniquement. */
  periode?: string;
  /** Champs specifiques au type de prestation (tracabilite du calcul). */
  details?: Record<string, unknown>;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
  lignes: LigneFactureInput[];
}

/**
 * Parametres contractuels d'une copropriete, lus sur public."Copropriete"
 * (App A). Servent d'entree aux calculs de depassement.
 *
 * IMPORTANT : chaque champ vaut `null` quand la colonne source est ABSENTE
 * (donnee non renseignee sur la fiche), a distinguer d'un `0` explicite (valeur
 * assumee). Un `null` ne doit JAMAIS etre remplace par un defaut permissif : le
 * service de la prestation concernee refuse alors de facturer (plutot que de
 * sur-facturer sur une franchise ou une plage inconnue). Cf. getParametresCopro.
 */
export interface ParametresCopro {
  /**
   * Duree de reunion CS incluse au contrat, en HEURES. `null` si non renseignee.
   *
   * ATTENTION : la colonne source s'appelle `csDurationMinutes` mais contient
   * bien des HEURES. Constate sur les 265 copropriétés : valeurs 0/1/2/3
   * (217 a la valeur 1) : des reunions de 1 a 3 MINUTES n'auraient aucun sens,
   * et `agDurationHours` vaut 2 en parallele. Le nom de colonne est trompeur.
   */
  franchiseCsHeures: number | null;
  /** Duree d'AG incluse au contrat, en heures (agDurationHours). `null` si absente. */
  dureeAgHeures: number | null;
  /** Heure de debut de la plage contractuelle d'AG (agStartMin). `null` si absente. */
  debutMinAgHeure: number | null;
  /** Heure de fin de la plage contractuelle d'AG (agEndMax). `null` si absente. */
  finMaxAgHeure: number | null;
}

/** Ligne d'historique de facturation (vue utilisateur). */
export interface FactureHistorique {
  id: string;
  coproCode: string;
  typePrestation: TypePrestation;
  libelle: string;
  dateFacture: string;
  statut: StatutFacture;
  /** Total HT = somme des lignes. */
  montantHt: number;
  /** Identifiant du brouillon chez le fournisseur, si emis. */
  factureExterneId?: string;
  /** Message du dernier echec d'emission, si en erreur. */
  erreur?: string;
  /** Initiales de l'auteur. */
  par?: string;
  /** Horodatage ISO de creation. */
  creeLe: string;
}

/** Facture en attente d'emission, avec ses lignes. */
export interface FactureAEmettre {
  id: string;
  coproCode: string;
  typePrestation: TypePrestation;
  libelle: string;
  dateFacture: string;
  lignes: Array<{
    description: string;
    categorieProduit: string | null;
    quantite: number;
    prixUnitaireHt: number;
    tauxTva: number;
  }>;
}

/** Une copropriete facturable en gestion courante pour un trimestre. */
export interface LigneGestionCourante {
  coproCode: string;
  /** Honoraires annuels TTC du contrat en vigueur. */
  honorairesAnnuelsTtc: number;
  /** Forfait postaux annuel du contrat en vigueur. */
  forfaitPostauxAnnuel: number;
  /** Vrai = frais postaux refactures au reel (ailleurs) : pas de ligne de timbres
   *  trimestrielle. Faux (ou absent) = forfait postaux annuel / 4 applique. */
  fraisPostauxReels: boolean;
  /** Vrai si une facture de gestion courante existe deja pour ce trimestre. */
  dejaFacture: boolean;
}

export interface FacturationRepository {
  /** Montant TTC du bareme pour une prestation et une annee. Null si absent. */
  getTarifTtc(identifiantPrestation: string, annee: number): Promise<number | null>;
  /** Contrat de gestion le plus recent d'une copro. Null si aucun. */
  getDernierContrat(coproCode: string): Promise<ContratCopro | null>;
  /** Parametres contractuels de la copro (franchises, plage d'AG). Null si copro inconnue. */
  getParametresCopro(coproCode: string): Promise<ParametresCopro | null>;
  /** Ouvre un cycle de contrat (une AG en ouvre un). Renvoie son id. */
  creerContrat(input: {
    coproCode: string;
    debutContrat: string;
    honorairesGestionTtc?: number;
    /** true = frais reels refactures, false = forfait annuel. */
    fraisPostauxReels?: boolean;
    forfaitPostauxTtc?: number;
  }): Promise<string>;
  /** Cree une facture et ses lignes. Renvoie l'id de la facture creee. */
  creerFacture(input: NouvelleFacture): Promise<string>;
  /** Tous les produits (liste Produits), pour resoudre libelle + ids a l'emission. */
  chargerProduits(): Promise<Produit[]>;
  /** Code agence (ML/LGC/HLS) de la copro, pour choisir le bon produit. Null si inconnu. */
  getAgenceCopro(coproCode: string): Promise<string | null>;
  /** Base facturable de la gestion courante pour un trimestre : les copros
   *  actives ayant un contrat en vigueur, avec le drapeau deja-facture. */
  chargerGestionCourante(periode: string): Promise<LigneGestionCourante[]>;

  // --- Emission vers l'outil de facturation externe ---

  /** Parmi les factures donnees, celles au statut 'a_facturer', avec leurs lignes.
   *  On emet TOUJOURS un lot explicite : jamais toute la file, pour qu'une facture
   *  laissee volontairement en attente ne parte pas par erreur. */
  listerFacturesAEmettre(ids: string[]): Promise<FactureAEmettre[]>;
  /** Identifiant client Pennylane d'une copro (Copropriete.pennylaneId). Null si absent. */
  getClientFacturationRef(coproCode: string): Promise<string | null>;
  /** Marque la facture comme emise et memorise l'id externe. */
  marquerFacturee(factureId: string, factureExterneId: string): Promise<void>;
  /** Marque la facture en erreur et memorise le message (diagnostic). */
  marquerErreur(factureId: string, message: string): Promise<void>;
  /** Historique des facturations, les plus recentes d'abord. Si `coproCodes` est fourni,
   *  BORNE aux factures de ces copros (le filtre est applique dans la requete, AVANT la
   *  limite : cloisonnement portefeuille = "nos facturations"). Omis = toutes. */
  listerFacturesRecentes(limite?: number, coproCodes?: string[]): Promise<FactureHistorique[]>;
  /** Repasse une facture en erreur au statut 'a_facturer' pour la rejouer. */
  remettreEnAttente(factureId: string): Promise<void>;
}
