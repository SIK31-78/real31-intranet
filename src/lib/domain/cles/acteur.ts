// Qui agit au comptoir, vu du domaine : son agence de session et les agences dont il est
// la direction. Resolu par la couche auth (lib/auth/acteur-cles.ts), consomme par les
// services sans qu'ils touchent aux roles (boundaries : services -> domain seulement).

export interface Acteur {
  id: string;
  nom: string;
  /** Agence de session (ML/LGC/HLS/ASN), undefined si inconnue. */
  agence?: string;
  /** « toutes » (direction pleine), ou les agences dont il est referent. */
  direction: "toutes" | string[];
}

export const MESSAGE_HORS_AGENCE = "Ce trousseau appartient à une autre agence : seule son équipe ou la direction peut agir dessus.";
export const MESSAGE_RESERVE_DIRECTION_CLES = "Réservé à la direction (corriger un mouvement, bloquer une entreprise, retirer un trousseau).";

/** Direction de cette agence (ou de toutes si aucune n'est donnee). */
export function estDirectionCles(a: Acteur, agence?: string): boolean {
  if (a.direction === "toutes") return true;
  if (agence === undefined) return a.direction.length > 0;
  return a.direction.some((x) => x.toUpperCase() === agence.toUpperCase());
}

/** Operer sur un trousseau : un collaborateur de son agence, ou la direction de cette agence. */
export function peutOperer(a: Acteur, agenceTrousseau: string): boolean {
  if (estDirectionCles(a, agenceTrousseau)) return true;
  return a.agence !== undefined && a.agence.toUpperCase() === agenceTrousseau.toUpperCase();
}
