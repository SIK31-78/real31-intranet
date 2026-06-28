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
  }): Promise<void>;
}
