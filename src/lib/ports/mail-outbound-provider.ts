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
   * TRANSFERE le message d'origine (pieces jointes d'origine conservees par Graph) a des
   * destinataires choisis, depuis la boite qui DETIENT le mail : mon texte et ma signature
   * au-dessus du message transfere, objet « TR: … » d'Outlook. `envoyer: false` laisse le
   * transfert en BROUILLON (boite partagee pendant le pilote, ADR-047). REA-350 (16/10/2026).
   */
  transferer(p: TransfertMail): Promise<{ webLink?: string }>;

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
   * L'envoi en trois temps de l'ecran E-mails (REA-421, 27/10/2026) : le brouillon de reponse
   * complet (fil, citation, corps, destinataires, PJ d'origine re-jointes), dont on rend l'id
   * Graph ; les fichiers de l'ordinateur y sont joints ensuite, un par un (ajouterPieceJointe
   * ou session d'upload) ; puis envoyerBrouillon, ou le brouillon reste dans Outlook. Un echec
   * avant le retour supprime le brouillon.
   */
  preparerBrouillonReponse(p: ReponseMail): Promise<{ id: string; webLink?: string }>;

  /** Joint un fichier au brouillon : un POST sous 3 Mo, une session d'upload au-dela. */
  ajouterPieceJointe(p: { boite: string; draftId: string; nom: string; contentType: string; octets: Uint8Array }): Promise<void>;

  /** Ouvre une session d'upload (fichier de plus de 3 Mo) sur le brouillon. L'URL rendue porte
   *  sa propre autorisation : elle ne quitte jamais le serveur en clair. */
  ouvrirSessionUpload(p: { boite: string; draftId: string; nom: string; contentType: string; taille: number }): Promise<{ uploadUrl: string }>;

  /** Depose une tranche [debut, debut + octets) d'une session ; `fini` quand la piece est complete. */
  envoyerTranche(p: { uploadUrl: string; debut: number; octets: Uint8Array; taille: number }): Promise<{ fini: boolean }>;

  /** Supprime un brouillon cree par l'app (envoi abandonne en cours de route). */
  supprimerBrouillon(p: { boite: string; id: string }): Promise<void>;

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
    /** Copie cachée : le mail à toute une copropriété (REA-305), jamais d'adresse visible. */
    cci?: string[];
    /** Signature (Signitic) posée sous le texte : un brouillon créé par l'app n'en a pas sinon. */
    signatureHtml?: string;
    /** Corps mis en forme, déjà nettoyé et habillé (REA-345) ; `corps` reste le texte équivalent. */
    corpsHtml?: string;
    piecesJointes?: PieceJointeMail[];
    /** Message d'origine cite sous la signature (reponse depuis une autre boite, REA-302). */
    citationHtml?: string;
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
    /** Message d'origine cite sous la signature (reponse depuis une autre boite, REA-302). */
    citationHtml?: string;
  }): Promise<void>;

  /**
   * La citation qu'Outlook met sous une reponse a ce mail (« De : / Envoye : / A : / Objet : »
   * puis le message) et l'objet « RE: ... ». Sert a repondre depuis une AUTRE boite sans
   * perdre l'historique (REA-302) : un brouillon de reponse est cree dans la boite du mail,
   * lu, puis supprime aussitot. Rien n'est envoye.
   */
  citationReponse(p: { boite: string; internetMessageId: string }): Promise<{ citationHtml: string; sujet: string }>;
}

export interface ReponseMail {
  boite: string;
  internetMessageId: string;
  corps: string;
  /** Corps mis en forme, déjà nettoyé et habillé (REA-345) ; `corps` reste le texte équivalent. */
  corpsHtml?: string;
  sujet?: string;
  a: string[];
  cc: string[];
  cci: string[];
  signatureHtml?: string;
  /** Ids des pieces jointes du mail D'ORIGINE a re-joindre a la reponse. */
  pjIds?: string[];
  /** Fichiers ajoutes depuis l'ordinateur, passes dans la requete (petits : ils voyagent en
   *  base64). L'ecran E-mails les depose apres coup sur le brouillon (REA-421). */
  piecesJointes?: PieceJointeMail[];
}

export interface PieceJointeMail {
  nom: string;
  contentType: string;
  base64: string;
}

export interface TransfertMail {
  boite: string;
  internetMessageId: string;
  a: string[];
  cc: string[];
  /** Texte écrit au-dessus du message transféré (peut être vide). */
  corps: string;
  signatureHtml?: string;
  /** true = le transfert part ; false = il reste en brouillon dans la boîte. */
  envoyer: boolean;
}
