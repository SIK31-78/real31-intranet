// Port du rangement des mails dans la boite generique (ADR-046) : verifier qu'un mail est
// encore a trier, assurer le dossier de destination, deplacer, remettre en reception.
// Ne depend que du domaine.

/** Ce que la boite dit d'un mail encore dans sa boite de reception. */
export interface MailEnReception {
  internetMessageId: string;
  conversationId?: string;
  expediteur: string;
  objet: string;
}

/** Ou se trouve un mail dans la boite, retrouve par son internetMessageId. */
export interface PositionMail {
  /** Id Graph actuel (il change a chaque deplacement). */
  messageId: string;
  folderId: string;
  enReception: boolean;
  categories: string[];
}

export interface RangementTriProvider {
  /** Le mail (id Graph) est-il encore dans la boite de reception ? null sinon (deja range, supprime). */
  lireEnReception(boite: string, messageId: string): Promise<MailEnReception | null>;
  /**
   * Garantit qu'un sous-dossier de la boite de reception porte ce nom. `folderIdConnu` : le
   * dossier deja cree pour cette cle ; il est renomme s'il ne porte plus le bon nom (un
   * assistant a change), recree s'il a disparu.
   */
  assurerDossier(boite: string, p: { folderIdConnu: string | null; nom: string }): Promise<{ folderId: string }>;
  /** Deplace le mail ; renvoie son nouvel id Graph (un deplacement change l'id). */
  deplacer(boite: string, messageId: string, folderId: string): Promise<{ messageId: string }>;
  /** Remet le mail dans la boite de reception (annulation). */
  remettreEnReception(boite: string, messageId: string): Promise<{ messageId: string }>;
  /** Ajoute et/ou retire une categorie Outlook (le code copro), sans toucher aux autres. */
  etiqueter(boite: string, messageId: string, p: { ajouter?: string; retirer?: string }): Promise<void>;
  /** Retrouve un mail dans toute la boite par son internetMessageId ; null s'il n'y est plus. */
  localiser(boite: string, internetMessageId: string): Promise<PositionMail | null>;
}
