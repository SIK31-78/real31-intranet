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
   * Cree un brouillon mail NEUF dans la boite (pas une reponse : aucun message
   * d'origine, aucun fil). Sert aux courriers sortants a froid (module sinistre :
   * declaration assureur, recours...). `corps` = texte (l'adapter le met en HTML
   * Aptos 11). Statut Draft : on N'ENVOIE PAS. Pas de signature injectee (Signitic
   * s'applique a l'ouverture cote Outlook, comme creerBrouillon). Renvoie le
   * webLink Outlook du brouillon cree si Graph le fournit.
   */
  creerBrouillonNeuf(p: {
    boite: string;
    sujet: string;
    corps: string;
    a?: string[];
    cc?: string[];
  }): Promise<{ webLink?: string }>;
}
