// Port sortant mail : creer un brouillon de reponse (et plus tard, envoyer).
// En reel, Graph (createReply -> brouillon dans Outlook). Ne depend de rien.

export interface MailOutboundProvider {
  /**
   * Cree un brouillon de REPONSE dans la boite, rattache au message d'origine
   * (fil + citation conserves par Graph). `corps` = texte de la reponse.
   * On n'injecte PAS la signature ici : Signitic l'ajoute (cf. decision design).
   */
  creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void>;

  /**
   * ENVOIE une reponse au message d'origine (fil + citation conserves) avec des
   * destinataires CHOISIS (A / Cc / Cci). Cree un brouillon de reponse, y pose le
   * corps + les destinataires, puis l'envoie. Action irreversible (vrai mail).
   */
  envoyer(p: {
    boite: string;
    internetMessageId: string;
    corps: string;
    sujet?: string;
    a: string[];
    cc: string[];
    cci: string[];
    signatureHtml?: string;
    /** Ids des pieces jointes du mail D'ORIGINE a re-joindre a la reponse. */
    pjIds?: string[];
  }): Promise<void>;

  /**
   * ENVOIE un mail NEUF (pas une reponse : aucun fil d'origine) depuis la boite, avec
   * destinataires CHOISIS (A / Cc / Cci), objet et corps. Le corps est du TEXTE brut,
   * rendu en HTML (Aptos 11pt) par l'adapter ; la signature est ajoutee dessous.
   * Action irreversible (vrai mail). Sert au mail au conseil syndical (dates CS/AG).
   */
  envoyerNeuf(p: {
    boite: string;
    a: string[];
    cc: string[];
    cci: string[];
    sujet: string;
    corps: string;
    signatureHtml?: string;
  }): Promise<void>;
}
