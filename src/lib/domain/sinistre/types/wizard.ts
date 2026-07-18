/**
 * État du moteur de wizard (engine/wizard.ts).
 *
 * Source de vérité ORDONNÉE et sérialisable d'un parcours (un local).
 * Le `WizardState` est volontairement minimal ; les vues métier (réponses
 * par libellé, gestionnaire, cas 2.1.3…) sont des sélecteurs dérivés.
 */

import type { NodeId } from './arbre';

/**
 * Un pas du parcours : le nœud quitté et, pour un nœud `question`, l'index de
 * l'option choisie. Pour un nœud `etape` (avance via « Continuer »),
 * `optionIndex` vaut `undefined`.
 */
export interface AnswerStep {
  nodeId: NodeId;
  optionIndex?: number;
}

export interface WizardState {
  /** Pas franchis dans l'ordre. Le dernier nœud courant n'y figure pas. */
  steps: AnswerStep[];
  /** Nœud actuellement affiché (terminal si `resultat`). */
  current: NodeId;
}
