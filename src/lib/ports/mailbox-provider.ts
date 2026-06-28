// Port "boite aux lettres" : operations d'ecriture sur la boite (deplacer, plus
// tard categoriser/marquer lu). Sert a refleter le classement du cockpit dans
// Outlook. Le type DossierBoite vit dans le domaine (mes-emails).

import type { DossierBoite, PieceJointeRef } from "@/lib/domain/mes-emails";

export type { DossierBoite, PieceJointeRef };

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

  /** Pieces jointes REELLES du mail (metadonnees), chargees a la demande. Exclut les
   *  images inline (signatures). */
  listerPiecesJointes(p: { boite: string; internetMessageId: string }): Promise<PieceJointeRef[]>;

  /** Contenu d'une piece jointe (base64) pour telechargement cote client. */
  lirePieceJointe(p: {
    boite: string;
    internetMessageId: string;
    attachmentId: string;
  }): Promise<{ nom: string; type: string; base64: string }>;
}
