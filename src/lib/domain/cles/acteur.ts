// Qui agit au comptoir, vu du domaine : son agence de session, les agences dont il est
// la direction, celles qu'une delegation lui ouvre et les activites qu'il dirige. Resolu
// par la couche auth (lib/auth/acteur-cles.ts), consomme par les services sans qu'ils
// touchent aux roles (boundaries : services -> domain seulement).
//
// Perimetre « agence x activite » (REA-90, ADR-049) : un trousseau porte une agence ET une
// activite (copro -> syndic, lot locatif -> location, bien en vente -> transaction). La
// directrice de la location encadre la location dans les quatre agences : lui donner une
// deuxieme agence la rebloquerait a la prochaine ouverture.

import type { Activite } from "@/lib/domain/collaborateur";
import type { Acces, Bien } from "./types";

export interface Acteur {
  id: string;
  nom: string;
  /** Agence de session (ML/LGC/HLS/ASN), undefined si inconnue. */
  agence?: string;
  /** « toutes » (direction pleine), ou les agences dont il est referent. */
  direction: "toutes" | string[];
  /** Agences ouvertes par une delegation d'agence active (intranet_delegation, ADR-041). */
  agencesDeleguees?: string[];
  /** Activites qu'il dirige sur tout le cabinet (cf. ACTIVITES_DIRIGEES). */
  activitesDirigees?: Activite[];
}

export const MESSAGE_HORS_AGENCE = "Ce trousseau appartient à une autre agence : seule son équipe ou la direction peut agir dessus.";
export const MESSAGE_RESERVE_DIRECTION_CLES = "Réservé à la direction (corriger un mouvement, bloquer une entreprise, retirer un trousseau).";

const ACTIVITE_DU_BIEN: Record<Bien["type"], Activite> = {
  copro: "syndic",
  lot_locatif: "location",
  bien_vente: "transaction",
};

/**
 * L'activite d'un trousseau : celle de son acces PRINCIPAL (ordre 0). Un trousseau sans
 * acces releve du syndic, seul cas existant avant la gestion locative.
 */
export function activiteDuTrousseau(t: { acces: readonly Pick<Acces, "bien" | "ordre">[] }): Activite {
  const principal = [...t.acces].sort((a, b) => a.ordre - b.ordre)[0];
  return principal ? ACTIVITE_DU_BIEN[principal.bien.type] : "syndic";
}

function memeAgence(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

/** Direction de cette agence (ou de toutes si aucune n'est donnee). */
export function estDirectionCles(a: Acteur, agence?: string): boolean {
  if (a.direction === "toutes") return true;
  if (agence === undefined) return a.direction.length > 0;
  return a.direction.some((x) => memeAgence(x, agence));
}

/**
 * Operer sur un trousseau (reserver, sortir, rentrer, creer, modifier) : un collaborateur
 * de son agence, une delegation active sur cette agence, la direction de cette agence, ou
 * quiconque DIRIGE l'activite du trousseau. Sans activite donnee, seule l'agence compte.
 *
 * Diriger une activite ouvre le comptoir, pas l'administration : corriger un mouvement ou
 * retirer un trousseau reste a la direction de l'agence (estDirectionCles).
 */
export function peutOperer(a: Acteur, agenceTrousseau: string, activite?: Activite): boolean {
  if (estDirectionCles(a, agenceTrousseau)) return true;
  if (a.agence !== undefined && memeAgence(a.agence, agenceTrousseau)) return true;
  if ((a.agencesDeleguees ?? []).some((x) => memeAgence(x, agenceTrousseau))) return true;
  return activite !== undefined && (a.activitesDirigees ?? []).includes(activite);
}
