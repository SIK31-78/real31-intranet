// Port "boite aux lettres" : operations d'ecriture sur la boite (deplacer, plus
// tard categoriser/marquer lu). Sert a refleter le classement du cockpit dans
// Outlook. Ne depend de rien.

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
}
