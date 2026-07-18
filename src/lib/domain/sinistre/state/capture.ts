/**
 * Configuration de la capture des coordonnées dans le wizard (plomberie UI).
 *
 * Sur certains nœuds, on propose un panneau repliable FACULTATIF pour saisir les
 * coordonnées d'une partie ou de l'assureur immeuble. La réponse à la question
 * reste le seul élément obligatoire ; `statutAssurance` se déduit de l'option.
 *
 * Centralisé ici (et nulle part ailleurs) car il référence des ids de nœuds.
 */

import type { NodeId, RolePartie, StatutAssurance } from '../types';

export type CaptureCible =
  | { kind: 'partie'; role: RolePartie }
  | { kind: 'assureurImmeuble' };

/** Nœud -> cible de capture (panneau « Renseigner les coordonnées »). */
export const CAPTURE_PAR_NOEUD: Record<NodeId, CaptureCible> = {
  q_co_assure: { kind: 'partie', role: 'coproprietaire' },
  q_occupant_assure: { kind: 'partie', role: 'occupant' },
  q_cno_assure_nonass: { kind: 'partie', role: 'coproprietaire' },
  q_cno_assure_exception: { kind: 'partie', role: 'coproprietaire' },
  q_cno_assure_vacant: { kind: 'partie', role: 'coproprietaire' },
  r_gest_immeuble_communs: { kind: 'assureurImmeuble' },
  r_gest_immeuble_subsidiaire: { kind: 'assureurImmeuble' },
};

export function cibleCapture(nodeId: NodeId): CaptureCible | undefined {
  return CAPTURE_PAR_NOEUD[nodeId];
}

/**
 * Déduit le statut d'assurance d'une partie depuis l'option choisie sur un nœud
 * de question « … est-il assuré ? » (option 0 = Oui - assuré, sinon non assuré).
 * Renvoie `undefined` pour les nœuds qui ne portent pas cette sémantique.
 */
const NOEUDS_ASSURANCE = new Set<NodeId>([
  'q_co_assure',
  'q_occupant_assure',
  'q_cno_assure_nonass',
  'q_cno_assure_exception',
  'q_cno_assure_vacant',
]);

export function deduireStatut(nodeId: NodeId, optionIndex: number): StatutAssurance | undefined {
  if (!NOEUDS_ASSURANCE.has(nodeId)) return undefined;
  return optionIndex === 0 ? 'assure' : 'non_assure';
}
