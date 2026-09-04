// Port (contrat) d'emission des factures vers l'outil de facturation externe
// (Pennylane aujourd'hui). Ne depend d'aucune techno : le domaine et les services
// ne connaissent que cette interface (ADR-001).

/** Ligne a emettre. Montants HT ; la TVA est portee par son taux. */
export interface LigneAEmettre {
  /** Libelle COURT de la prestation : titre de la ligne sur le PDF. */
  libelle: string;
  /** Detail affiche sous le titre (dates, heures, decompte des heures). */
  detail?: string;
  quantite: number;
  prixUnitaireHt: number;
  /** Ex : 0.20 pour 20 %. */
  tauxTva: number;
  /** Identifiant produit Pennylane (rattachement catalogue). Optionnel. */
  productId?: string;
  /** Compte comptable de produits (rattachement compta). Optionnel. */
  ledgerAccountId?: string;
}

export interface DemandeEmission {
  /**
   * Reference EXTERNE du client chez le fournisseur (Copropriete.pennylaneId,
   * un UUID). L'adapter la resout en identifiant interne avant d'emettre.
   */
  clientRef: string;
  /**
   * Code entite de la copropriete (SXXX). Repris tel quel sur le PDF de la
   * facture : c'est ce qui permet a la copropriete d'identifier a quel immeuble
   * se rapporte la facture.
   */
  codeEntite: string;
  /**
   * Mention libre imprimee sur le PDF a cote du code entite, quand la
   * prestation en porte une (aujourd'hui la reference du sinistre saisie par la
   * compta). Absente = seul le code entite est imprime.
   */
  mentionLibre?: string;
  /** Libelle general de la facture. */
  libelle: string;
  /** Objet de la facture (pdf_invoice_subject), ex "Honoraires du trimestre en cours". */
  sujet?: string;
  /** Date de facture, ISO "YYYY-MM-DD". */
  dateFacture: string;
  lignes: LigneAEmettre[];
}

export interface ResultatEmission {
  /** Identifiant de la facture creee chez le fournisseur. */
  factureExterneId: string;
  /**
   * La facture a-t-elle ete VALIDEE (finalisee) chez le fournisseur, ou reste-t-elle
   * un brouillon a valider a la main ? Absent = brouillon.
   */
  validee?: boolean;
}

export interface InvoicingProvider {
  /**
   * Emet la facture chez le fournisseur et renvoie son identifiant.
   *
   * Par DEFAUT la facture est creee au statut BROUILLON : la validation reste un
   * geste humain cote comptabilite. L'adapter peut enchainer la validation quand
   * l'exploitation le demande explicitement (Pennylane : `PENNYLANE_FACTURE_VALIDEE`),
   * et le dit alors dans `validee` - jamais en silence, jamais par defaut : une
   * facture validee est comptablement engagee et ne se defait pas.
   */
  emettreFacture(demande: DemandeEmission): Promise<ResultatEmission>;
}
