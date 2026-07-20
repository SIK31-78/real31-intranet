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
  | "depassement_ag";

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
  description: string;
  quantite: number;
  prixUnitaireHt: number;
  /** Defaut : 0.20 (cote base). */
  tauxTva?: number;
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
  /** Champs specifiques au type de prestation (tracabilite du calcul). */
  details?: Record<string, unknown>;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
  lignes: LigneFactureInput[];
}

/**
 * Parametres contractuels d'une copropriete, lus sur public."Copropriete"
 * (App A). Servent d'entree aux calculs de depassement.
 */
export interface ParametresCopro {
  /**
   * Duree de reunion CS incluse au contrat, en HEURES.
   *
   * ATTENTION : la colonne source s'appelle `csDurationMinutes` mais contient
   * bien des HEURES. Constate sur les 265 copropriétés : valeurs 0/1/2/3
   * (217 a la valeur 1) : des reunions de 1 a 3 MINUTES n'auraient aucun sens,
   * et `agDurationHours` vaut 2 en parallele. Le nom de colonne est trompeur.
   */
  franchiseCsHeures: number;
  /** Duree d'AG incluse au contrat, en heures (agDurationHours). */
  dureeAgHeures: number;
  /** Heure de debut de la plage contractuelle d'AG (agStartMin). */
  debutMinAgHeure: number;
  /** Heure de fin de la plage contractuelle d'AG (agEndMax). */
  finMaxAgHeure: number;
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
  libelle: string;
  dateFacture: string;
  lignes: Array<{ description: string; quantite: number; prixUnitaireHt: number; tauxTva: number }>;
}

export interface FacturationRepository {
  /** Montant TTC du bareme pour une prestation et une annee. Null si absent. */
  getTarifTtc(identifiantPrestation: string, annee: number): Promise<number | null>;
  /** Contrat de gestion le plus recent d'une copro. Null si aucun. */
  getDernierContrat(coproCode: string): Promise<ContratCopro | null>;
  /** Parametres contractuels de la copro (franchises, plage d'AG). Null si copro inconnue. */
  getParametresCopro(coproCode: string): Promise<ParametresCopro | null>;
  /** Cree une facture et ses lignes. Renvoie l'id de la facture creee. */
  creerFacture(input: NouvelleFacture): Promise<string>;

  // --- Emission vers l'outil de facturation externe ---

  /** Factures au statut 'a_facturer', avec leurs lignes. */
  listerFacturesAEmettre(limite?: number): Promise<FactureAEmettre[]>;
  /** Identifiant client Pennylane d'une copro (Copropriete.pennylaneId). Null si absent. */
  getClientFacturationRef(coproCode: string): Promise<string | null>;
  /** Marque la facture comme emise et memorise l'id externe. */
  marquerFacturee(factureId: string, factureExterneId: string): Promise<void>;
  /** Marque la facture en erreur et memorise le message (diagnostic). */
  marquerErreur(factureId: string, message: string): Promise<void>;
  /** Historique des facturations, les plus recentes d'abord. */
  listerFacturesRecentes(limite?: number): Promise<FactureHistorique[]>;
  /** Repasse une facture en erreur au statut 'a_facturer' pour la rejouer. */
  remettreEnAttente(factureId: string): Promise<void>;
}
