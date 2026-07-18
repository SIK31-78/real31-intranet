/**
 * Aide à la gestion des phases et de la RÈGLE MULTI-LOCAUX (CLAUDE.md §5).
 *
 * La phase 1 (qualification) est COMMUNE au sinistre ; à partir de la phase 2
 * (assureur gestionnaire), le parcours est exécuté PAR LOCAL. On détecte le
 * point de bascule par le rang de phase du nœud - sans coder d'id en dur.
 */

import { getNode, pathOf } from './wizard';
import type { DecisionNode, NodeId, WizardState } from '../types';

/** Rang numérique d'une phase (« 2 - … » - 2 ; « 5/6/7 - … » - 5 ; « Sortie » - null). */
export function phaseRank(node: DecisionNode): number | null {
  const m = node.phase.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Le parcours par local commence à la phase ≥ 2. */
export function estPhaseParLocal(node: DecisionNode): boolean {
  const r = phaseRank(node);
  return r !== null && r >= 2;
}

export interface Commune {
  /** Préfixe commun (phase 0/1) à dupliquer pour chaque local. */
  prefix: WizardState;
  /** Nœud de bascule vers le parcours par local (phase ≥ 2), si atteint. */
  branchNode?: NodeId;
}

/**
 * Extrait le préfixe commun d'un parcours : tous les pas jusqu'au premier nœud
 * de phase ≥ 2. Si la phase 1 débouche directement sur une sortie (pas de
 * parcours par local), `branchNode` est absent.
 */
export function communePrefix(wizard: WizardState): Commune {
  const path = pathOf(wizard);
  for (let i = 0; i < path.length; i++) {
    const id = path[i]!;
    if (estPhaseParLocal(getNode(id))) {
      return { prefix: { steps: wizard.steps.slice(0, i), current: id }, branchNode: id };
    }
  }
  return { prefix: wizard };
}

/** Vrai si le parcours a atteint (ou dépassé) le point de bascule par local. */
export function aBrancheParLocal(wizard: WizardState): boolean {
  return communePrefix(wizard).branchNode !== undefined;
}
