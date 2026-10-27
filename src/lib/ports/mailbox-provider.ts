// Port "boite aux lettres" : operations d'ecriture sur la boite (deplacer, corbeille,
// marquer lu) et lectures d'appoint (dossiers, pieces jointes, etat lu). Sert a refleter
// dans Outlook ce qui est fait dans l'intranet. Le type DossierBoite vit dans le domaine.

import type { DossierBoite, PieceJointeRef } from "@/lib/domain/mes-emails";

export type { DossierBoite, PieceJointeRef };

export interface MailboxProvider {
  /** Liste les vrais dossiers de la boite (racine + sous-dossiers de l'inbox sur 2
   *  niveaux, dedupliques) pour alimenter le selecteur de classement du cockpit. */
  listerDossiers(boite: string): Promise<DossierBoite[]>;

  /** Cree un sous-dossier de la boite de reception (ou reprend celui qui porte deja ce
   *  nom). Sert au sous-dossier d'une copro qui n'en a pas encore. */
  creerDossier(boite: string, nom: string): Promise<DossierBoite>;

  /** Deplace le mail dans un dossier CHOISI (par son id Graph) : pas de matching,
   *  destination explicite. Renvoie si le deplacement a eu lieu. */
  classerDansDossier(p: {
    boite: string;
    internetMessageId: string;
    folderId: string;
  }): Promise<{ deplace: boolean }>;

  /**
   * Met des mails a la corbeille : deplacement vers « Elements supprimes » (deleteditems),
   * donc REVERSIBLE depuis Outlook, jamais une suppression definitive. Un echec sur un mail
   * (deja deplace, introuvable) n'arrete pas les autres : on rend les deux listes.
   * REA-340 (16/10/2026).
   */
  mettreALaCorbeille(p: { boite: string; internetMessageIds: string[] }): Promise<ResultatCorbeille>;

  /** Pieces jointes REELLES du mail (metadonnees), chargees a la demande. Exclut les
   *  images inline (signatures). */
  listerPiecesJointes(p: { boite: string; internetMessageId: string }): Promise<PieceJointeRef[]>;

  /** Les images INLINE du mail (collees dans le corps, logos compris), metadonnees seulement. */
  listerImagesInline(p: { boite: string; internetMessageId: string }): Promise<PieceJointeRef[]>;

  /** Contenu d'une piece jointe (base64) pour telechargement cote client. */
  lirePieceJointe(p: {
    boite: string;
    internetMessageId: string;
    attachmentId: string;
  }): Promise<{ nom: string; type: string; base64: string }>;

  /**
   * Pose le « lu » d'Outlook sur le mail (REA-422, 27/10/2026) : ouvrir un mail dans l'intranet
   * le marque lu dans Outlook aussi. Sur une boite partagee, le lu d'Outlook est commun aux
   * collegues : c'est voulu (on repond depuis l'un ou l'autre outil, sans difference).
   */
  marquerLu(p: { boite: string; internetMessageId: string; lu: boolean }): Promise<void>;

  /**
   * Le « lu » d'Outlook des mails affiches, cle internetMessageId (REA-422). Par identifiants
   * (boite partagee : les mails distribues) ou les N plus recents de la reception (boite perso).
   * Un mail absent de la reponse n'est pas dans la carte : l'appelant le tient pour non lu.
   */
  lireEtatsLu(p: { boite: string; internetMessageIds: string[] } | { boite: string; recents: number }): Promise<Map<string, boolean>>;
}

export interface ResultatCorbeille {
  /** internetMessageId des mails deplaces dans « Elements supprimes ». */
  deplaces: string[];
  /** internetMessageId des mails restes en place (introuvables, refus Graph). */
  echecs: string[];
}
