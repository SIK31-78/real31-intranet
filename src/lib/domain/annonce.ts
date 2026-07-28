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
  /** CIBLE par agences (codes ML/LGC/HLS/ASN). Vide/absent + emails vide = tout le groupe. */
  agences?: string[];
  /** CIBLE par collaborateurs (emails). Cumulable avec agences (union). */
  emails?: string[];
  auteurEmail?: string;
  auteurInitiales?: string;
  /** ISO. */
  createdAt: string;
  /** ISO ; touche a chaque edition. */
  updatedAt?: string;
}

/**
 * L'annonce vise-t-elle CE collaborateur ? Regle (Sekou 2026-07-28) :
 *   - aucune cible (ni agences ni emails) -> tout le groupe -> visible ;
 *   - sinon UNION : vise si son email est liste OU si son agence est listee.
 * Un collaborateur SANS agence connue n'est atteint que par email ou par une
 * annonce groupe (jamais un ecran qui crie pour la mauvaise agence).
 */
export function annonceVisiblePour(
  annonce: Pick<Annonce, "agences" | "emails">,
  email: string | null | undefined,
  agenceCode: string | null | undefined,
): boolean {
  const agences = annonce.agences ?? [];
  const emails = annonce.emails ?? [];
  if (agences.length === 0 && emails.length === 0) return true; // tout le groupe
  const e = (email ?? "").trim().toLowerCase();
  if (e && emails.some((x) => x.trim().toLowerCase() === e)) return true;
  const a = (agenceCode ?? "").trim().toUpperCase();
  if (a && agences.some((x) => x.trim().toUpperCase() === a)) return true;
  return false;
}

/** Libelle court de la cible (badge admin). */
export function libelleCible(annonce: Pick<Annonce, "agences" | "emails">): string {
  const agences = annonce.agences ?? [];
  const emails = annonce.emails ?? [];
  if (agences.length === 0 && emails.length === 0) return "Tout le groupe";
  const parts: string[] = [];
  if (agences.length > 0) parts.push(agences.join(", "));
  if (emails.length > 0) parts.push(`${emails.length} collaborateur${emails.length > 1 ? "s" : ""}`);
  return parts.join(" + ");
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
