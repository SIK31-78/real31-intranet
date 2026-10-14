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
   * Cree un brouillon de TRANSFERT du message d'origine (pieces jointes conservees par
   * Graph), adresse a `a`, avec l'objet `sujet` (remplace « TR: … ») et un commentaire en
   * tete. Statut Draft : on N'ENVOIE PAS. Sert a transmettre une facture recue a la boite
   * de reception des factures ESTALE avec sa codification dans l'objet.
   */
  creerTransfert(p: {
    boite: string;
    internetMessageId: string;
    a: string[];
    sujet: string;
    commentaire: string;
  }): Promise<{ webLink?: string; internetMessageId?: string }>;

  /**
   * ENVOIE une reponse au message d'origine (fil + citation conserves) avec des
   * destinataires CHOISIS (A / Cc / Cci). Cree un brouillon de reponse, y pose le
   * corps + les destinataires, puis l'envoie. Action irreversible (vrai mail).
   */
  envoyer(p: ReponseMail): Promise<void>;

  /**
   * Meme reponse que `envoyer` (fil, destinataires, objet, pieces jointes), mais laissee en
   * BROUILLON dans la boite : rien ne part. C'est la voie de la boite partagee pendant le
   * pilote : on relit et on envoie dans Outlook. Pas de signature injectee (Signitic
   * l'ajoute a l'ouverture dans Outlook). Renvoie le lien Outlook du brouillon.
   */
  creerBrouillonReponse(p: ReponseMail): Promise<{ webLink?: string }>;

  /**
   * Cree un brouillon mail NEUF dans la boite (pas une reponse : aucun message
   * d'origine, aucun fil). Sert aux courriers sortants a froid (module sinistre :
   * declaration assureur, recours...). `corps` = texte (l'adapter le met en HTML
   * Aptos 11). Statut Draft : on N'ENVOIE PAS. Pas de signature injectee (Signitic
   * s'applique a l'ouverture cote Outlook, comme creerBrouillon). Renvoie le
   * webLink Outlook du brouillon cree et son internetMessageId (stable, il survit a
   * l'envoi et aux deplacements : sert a rattacher le mail a un dossier).
   * `piecesJointes` : jointes au brouillon (l'ODJ du CS en PDF, REA-146 ; un fichier joint
   * a la main). Petites : elles voyagent en base64 dans la requete de creation (~3 Mo au total).
   */
  creerBrouillonNeuf(p: {
    boite: string;
    sujet: string;
    corps: string;
    a?: string[];
    cc?: string[];
    /** Signature (Signitic) posée sous le texte : un brouillon créé par l'app n'en a pas sinon. */
    signatureHtml?: string;
    piecesJointes?: PieceJointeMail[];
  }): Promise<{ webLink?: string; internetMessageId?: string; id?: string }>;

  /**
   * ENVOIE un brouillon deja cree (son `id` Graph, rendu par creerBrouillonNeuf). Action
   * irreversible. Creer puis envoyer garde l'internetMessageId du mail, qui sert a le
   * rattacher a un dossier (envoyerNeuf n'en rend aucun).
   */
  envoyerBrouillon(p: { boite: string; id: string }): Promise<void>;

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
    /**
     * Corps HTML deja compose (tableau, styles inline), quand le texte ne suffit pas
     * (recap AG au comptable). L'appelant en repond : il DOIT echapper ses valeurs.
     * `corps` reste le texte equivalent (journal, tests, fournisseur sans HTML).
     */
    corpsHtml?: string;
    signatureHtml?: string;
    /** Pieces jointes (le contrat de l'offre en PDF). Petites : Graph accepte ~3 Mo en base64 par sendMail. */
    piecesJointes?: PieceJointeMail[];
  }): Promise<void>;
}

export interface ReponseMail {
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
  /** Fichiers ajoutes depuis l'ordinateur (3 Mo max chacun : envoi simple de Graph). */
  piecesJointes?: PieceJointeMail[];
}

export interface PieceJointeMail {
  nom: string;
  contentType: string;
  base64: string;
}
