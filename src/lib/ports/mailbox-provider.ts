// Port "boite aux lettres" : operations d'ecriture sur la boite (deplacer, plus
// tard categoriser/marquer lu). Sert a refleter le classement du cockpit dans
// Outlook. Ne depend de rien.

/** Un dossier reel de la boite Outlook (pour le selecteur de classement). */
export interface DossierBoite {
  id: string;
  nom: string;
  /** 0 = dossier racine de la boite, 1 = sous-dossier de la boite de reception. */
  niveau: number;
}

export interface MailboxProvider {
  /**
   * Deplace le mail dans le sous-dossier Outlook de la copropriete (best-effort,
   * matching tolerant code/nom). Renvoie si un deplacement a eu lieu et le nom du
   * dossier cible (null si aucun dossier ne correspond -> on ne touche a rien).
   */
  classerDansCopro(p: {
    boite: string;
    internetMessageId: string;
    coproCode: string;
    coproNom: string;
  }): Promise<{ deplace: boolean; dossier?: string }>;

  /** Liste les vrais dossiers de la boite (racine + sous-dossiers de l'inbox sur 2
   *  niveaux, dedupliques) pour alimenter le selecteur de classement du cockpit. */
  listerDossiers(boite: string): Promise<DossierBoite[]>;

  /** Deplace le mail dans un dossier CHOISI (par son id Graph) : pas de matching,
   *  destination explicite. Renvoie si le deplacement a eu lieu. */
  classerDansDossier(p: {
    boite: string;
    internetMessageId: string;
    folderId: string;
  }): Promise<{ deplace: boolean }>;
}
