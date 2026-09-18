// Qui agit au comptoir : l'agence de session, la direction, et les gardes (ADR-040).
//
// L'agence de session = Gestionnaire.agencyId resolu en code (ML/LGC/HLS/ASN). Un
// collaborateur sans agence connue lit tout, n'ecrit rien ; la direction (de l'agence
// du trousseau) fait tout.

import { estDirection, peutAdministrerCles, peutOperererCles, profilDe, type Profil } from "@/lib/auth/roles";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";

export interface Acteur {
  id: string;
  nom: string;
  /** Agence de session, undefined si inconnue. */
  agence?: string;
  profil: Profil;
}

export async function acteurDepuis(g: Gestionnaire): Promise<Acteur> {
  const agence = await codeAgence(g.agencyId);
  return { id: g.id, nom: g.nomComplet, ...(agence ? { agence } : {}), profil: profilDe(g) };
}

/** L'agence dont on liste les trousseaux : la sienne ; la direction sans agence voit tout. */
export function agenceVisible(a: Acteur): string | undefined {
  if (a.agence) return a.agence;
  return estDirection(a.profil) ? undefined : undefined;
}

export const MESSAGE_HORS_AGENCE = "Ce trousseau appartient à une autre agence : seule son équipe ou la direction peut agir dessus.";
export const MESSAGE_RESERVE_DIRECTION_CLES = "Réservé à la direction (corriger un mouvement, bloquer une entreprise, retirer un trousseau).";

export function peutOperer(a: Acteur, agenceTrousseau: string): boolean {
  return peutOperererCles(a.profil, a.agence, agenceTrousseau);
}

export function estDirectionCles(a: Acteur, agenceTrousseau?: string): boolean {
  return peutAdministrerCles(a.profil, agenceTrousseau);
}
