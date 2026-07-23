// =============================================================================
// DOMAINE des ANNONCES du reseau (direction) affichees sur l'accueil.
// Module PUR : zero I/O. Une annonce = un message court (titre + corps optionnel),
// active ou non (brouillon / retiree), avec un niveau pour l'accent visuel.
// =============================================================================

/** Accent visuel de l'annonce. */
export const NIVEAUX_ANNONCE = ["info", "important"] as const;
export type NiveauAnnonce = (typeof NIVEAUX_ANNONCE)[number];

export function estNiveauAnnonce(v: string): v is NiveauAnnonce {
  return (NIVEAUX_ANNONCE as readonly string[]).includes(v);
}

export interface Annonce {
  id: string;
  /** Titre court, affiche sur l'accueil. */
  titre: string;
  /** Corps optionnel (detail). */
  corps?: string;
  niveau: NiveauAnnonce;
  /** Visible sur l'accueil ? false = brouillon / retiree (garde en base). */
  actif: boolean;
  auteurEmail?: string;
  auteurInitiales?: string;
  /** ISO. */
  createdAt: string;
  /** ISO ; touche a chaque edition. */
  updatedAt?: string;
}

/**
 * Table `intranet_annonces` pas encore creee (SQL non passe) : levee par l'adapter
 * Supabase. L'accueil retombe alors sur un etat vide (aucune annonce), le panneau
 * admin affiche un bandeau "SQL a passer" - jamais un crash.
 */
export class AnnoncesNonConfigureError extends Error {
  constructor() {
    super("Annonces non configurées : la table intranet_annonces n'existe pas encore.");
    this.name = "AnnoncesNonConfigureError";
  }
}
