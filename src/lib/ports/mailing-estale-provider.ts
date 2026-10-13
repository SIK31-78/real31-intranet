// Port : mailings ESTALE aux copropriétaires (REA-144). Le contrat ne connaît QUE la
// création d'un BROUILLON : aucune méthode d'envoi, volontairement. L'envoi se lance dans
// ESTALE, par le gestionnaire, après relecture du texte et des destinataires.

export interface BrouillonMailing {
  coproCode: string;
  /** Titre interne du mailing dans ESTALE (liste des mailings). */
  titre: string;
  /** Objet du mail reçu par les copropriétaires. */
  objet: string;
  /** Corps HTML. */
  contenuHtml: string;
  /** Adresse de réponse (le gestionnaire) ; absente = celle par défaut d'ESTALE. */
  repondreA?: string;
}

export interface MailingCree {
  mailingId: string;
  /** Référence ESTALE affichée dans la liste des mailings, ex "00015". */
  reference: string;
  titre: string;
  /** Copropriétaires ajoutés en destinataires, tous par e-mail. */
  destinatairesMail: number;
  /** Copropriétaires écartés faute d'e-mail utilisable (à prévenir autrement). */
  sansEmail: number;
  /** Coût annoncé par ESTALE pour l'envoi (0 attendu pour du mail simple). */
  coutEnvoi: number;
  /** Lien pour ouvrir ESTALE. */
  lien: string;
}

export interface MailingEstaleProvider {
  /**
   * Crée le mailing dans ESTALE SANS L'ENVOYER : catégorie informative, objet + corps,
   * destinataires = copropriétaires actifs de la copro joignables par e-mail. Lève une
   * erreur lisible si la copro est inconnue d'ESTALE ou n'a aucun destinataire.
   */
  creerBrouillon(b: BrouillonMailing): Promise<MailingCree>;
}
