// Port (contrat) des annonces reseau (table native intranet_annonces).
// Ne depend que du domaine. L'accueil lit `listerActives` ; le panneau admin lit
// `listerToutes` et pilote la creation / edition / suppression.

import type { Annonce, NiveauAnnonce } from "@/lib/domain/annonce";

/** Ce qu'on ecrit a la creation. L'auteur vient de la SESSION (jamais du client). */
export interface SaisieAnnonce {
  titre: string;
  corps?: string;
  niveau: NiveauAnnonce;
  actif: boolean;
  auteurEmail?: string;
  auteurInitiales?: string;
}

/** Edition admin. Tout champ absent = ne pas toucher. `corps: null` efface le corps. */
export interface PatchAnnonce {
  titre?: string;
  corps?: string | null;
  niveau?: NiveauAnnonce;
  actif?: boolean;
}

export interface AnnonceRepository {
  /** Annonces VISIBLES sur l'accueil (actif = true), la plus recente d'abord. */
  listerActives(): Promise<Annonce[]>;
  /** Toutes les annonces (actives ET brouillons), pour le panneau admin. */
  listerToutes(): Promise<Annonce[]>;
  /** Cree une annonce et renvoie l'enregistrement. */
  creer(saisie: SaisieAnnonce): Promise<Annonce>;
  /** Edite / (dés)active une annonce. Touche updated_at. null = introuvable. */
  patch(id: string, patch: PatchAnnonce): Promise<Annonce | null>;
  /** Supprime definitivement une annonce. false = introuvable. */
  supprimer(id: string): Promise<boolean>;
}
