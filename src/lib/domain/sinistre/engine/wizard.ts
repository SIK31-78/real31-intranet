/**
 * Moteur de wizard - navigation pure et data-driven dans l'arbre de décision.
 *
 * Aucune règle métier ni id de nœud n'est codé ici : le moteur ne connaît que
 * les TYPES de nœuds (question | etape | resultat) et lit l'arbre fourni par
 * `src/data`. Toutes les fonctions sont pures (état immuable).
 */

import { nodes, noeudInitial, courriers, parametres } from '../data';
import type {
  CourrierId,
  DecisionNode,
  EtapeNode,
  NodeId,
  NodeOption,
  ResultatNode,
  WizardState,
} from '../types';

// --- Accès aux nœuds ------------------------------------------------------

/** Récupère un nœud par son id (lève si introuvable - invariant garanti par validate-data). */
export function getNode(id: NodeId): DecisionNode {
  const node = nodes[id];
  if (!node) throw new Error(`Nœud introuvable : « ${id} »`);
  return node;
}

export function currentNode(state: WizardState): DecisionNode {
  return getNode(state.current);
}

export function isTerminal(state: WizardState): boolean {
  return currentNode(state).type === 'resultat';
}

// --- Démarrage ------------------------------------------------------------

/** Id du nœud initial du parcours (CLAUDE.md §7 `start()`). */
export function start(): NodeId {
  return noeudInitial;
}

/** État initial d'un parcours vierge. */
export function initialState(): WizardState {
  return { steps: [], current: noeudInitial };
}

// --- Transitions ----------------------------------------------------------

/**
 * Enregistre la réponse à un nœud `question` et avance vers l'option choisie.
 * `nodeId` doit être le nœud courant (garde-fou contre les états incohérents).
 */
export function answer(state: WizardState, nodeId: NodeId, optionIndex: number): WizardState {
  if (state.current !== nodeId) {
    throw new Error(`answer : « ${nodeId} » n'est pas le nœud courant (« ${state.current} »).`);
  }
  const node = getNode(nodeId);
  if (node.type !== 'question') {
    throw new Error(`answer : le nœud « ${nodeId} » n'est pas une question.`);
  }
  const option = node.options[optionIndex];
  if (!option) {
    throw new Error(`answer : option #${optionIndex} inexistante sur « ${nodeId} ».`);
  }
  return { steps: [...state.steps, { nodeId, optionIndex }], current: option.suivant };
}

/** Avance depuis un nœud `etape` vers son `suivant` (bouton « Continuer »). */
export function advance(state: WizardState): WizardState {
  const node = currentNode(state);
  if (node.type !== 'etape') {
    throw new Error(`advance : le nœud « ${state.current} » n'est pas une étape.`);
  }
  return { steps: [...state.steps, { nodeId: state.current }], current: node.suivant };
}

/** Revient au nœud précédent ; invalide automatiquement tout l'aval. */
export function back(state: WizardState): WizardState {
  if (state.steps.length === 0) return state;
  const last = state.steps[state.steps.length - 1]!;
  return { steps: state.steps.slice(0, -1), current: last.nodeId };
}

/**
 * Revient à un nœud précis du chemin pour modifier sa réponse (H-4).
 * Invalide tout l'aval (mêmes règles que `back`). Sans effet si le nœud n'est
 * pas dans le chemin déjà parcouru.
 */
export function revenirA(state: WizardState, nodeId: NodeId): WizardState {
  const idx = state.steps.findIndex((s) => s.nodeId === nodeId);
  if (idx < 0) return state;
  return { steps: state.steps.slice(0, idx), current: nodeId };
}

/** Étape « transparente » (non affichée en plein écran) - G-3. */
export function isTransparent(node: DecisionNode): boolean {
  return node.type === 'etape' && node.transparent === true;
}

/** Avance automatiquement tant que le nœud courant est une étape transparente. */
export function settleForward(state: WizardState): WizardState {
  let s = state;
  while (isTransparent(getNode(s.current))) s = advance(s);
  return s;
}

/** Recule automatiquement tant que le nœud courant est une étape transparente. */
export function settleBackward(state: WizardState): WizardState {
  let s = state;
  while (s.steps.length > 0 && isTransparent(getNode(s.current))) s = back(s);
  return s;
}

// --- Sélecteurs -----------------------------------------------------------

/** Chemin parcouru : nœuds quittés, dans l'ordre, suivis du nœud courant. */
export function pathOf(state: WizardState): NodeId[] {
  return [...state.steps.map((s) => s.nodeId), state.current];
}

/** Actions du syndic agrégées sur le chemin (étapes + résultat), sans doublon. */
export function actionsSyndic(state: WizardState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of pathOf(state)) {
    const node = getNode(id);
    const actions = 'actions_syndic' in node ? node.actions_syndic : undefined;
    for (const a of actions ?? []) {
      if (!seen.has(a)) {
        seen.add(a);
        out.push(a);
      }
    }
  }
  return out;
}

/** Courriers dont les déclencheurs croisent le chemin parcouru (ordre du JSON). */
export function courriersRecommandes(state: WizardState): CourrierId[] {
  const path = new Set(pathOf(state));
  return courriers
    .filter((c) => c.declencheurs_noeuds.some((n) => path.has(n)))
    .map((c) => c.id);
}

// --- Reconstitution métier ------------------------------------------------

/** Map nœud-question -> libellé de l'option choisie (vue §5 `reponses`). */
export function reponses(state: WizardState): Record<NodeId, string> {
  const out: Record<NodeId, string> = {};
  for (const step of state.steps) {
    if (step.optionIndex === undefined) continue;
    const node = getNode(step.nodeId);
    if (node.type === 'question') {
      const opt = node.options[step.optionIndex];
      if (opt) out[step.nodeId] = opt.label;
    }
  }
  return out;
}

/** Cas du tableau IRSI 2.1.3 retenu sur le chemin, le cas échéant. */
export function cas213(state: WizardState): number | undefined {
  let value: number | undefined;
  for (const step of state.steps) {
    const opt = chosenOption(step.nodeId, step.optionIndex);
    if (opt?.cas_213 !== undefined) value = opt.cas_213;
  }
  return value;
}

/** Dernier nœud `etape` traversé portant un assureur gestionnaire. */
export function gestionnaireNode(state: WizardState): EtapeNode | undefined {
  let found: EtapeNode | undefined;
  for (const id of pathOf(state)) {
    const node = getNode(id);
    if (node.type === 'etape' && node.gestionnaire) found = node;
  }
  return found;
}

/**
 * Vrai si le nœud courant a été atteint par une réponse d'incertitude
 * (« Je ne sais pas », option marquée `incertitude`) - E-2. On regarde le
 * DERNIER pas franchi : c'est la réponse qui a déterminé l'orientation actuelle
 * (typiquement vers la subsidiarité immeuble).
 */
export function subsidiariteParIncertitude(state: WizardState): boolean {
  const last = state.steps[state.steps.length - 1];
  if (!last || last.optionIndex === undefined) return false;
  const node = getNode(last.nodeId);
  return node.type === 'question' && node.options[last.optionIndex]?.incertitude === true;
}

/** Vrai si le chemin comporte une réponse « sinistre mixte » (G-5). */
export function cheminMixte(state: WizardState): boolean {
  return state.steps.some((s) => {
    if (s.optionIndex === undefined) return false;
    const node = getNode(s.nodeId);
    return node.type === 'question' && node.options[s.optionIndex]?.mixte === true;
  });
}

/** Id du nœud résultat atteint, si le parcours est terminé. */
export function resultatId(state: WizardState): NodeId | undefined {
  return isTerminal(state) ? state.current : undefined;
}

/** Nœud résultat atteint, si le parcours est terminé. */
export function resultatNode(state: WizardState): ResultatNode | undefined {
  const node = currentNode(state);
  return node.type === 'resultat' ? node : undefined;
}

// --- Tranche IRSI & assiette (sélecteurs de projection) -------------------

export type Tranche = 'tranche_1' | 'tranche_2' | 'hors_irsi';

/**
 * Seul point de couplage assumé à l'id `q_tranche` : la notion de tranche vit
 * exclusivement à ce nœud (question « montant estimé de l'assiette »). Les trois
 * options y sont, dans l'ordre, tranche 1 / tranche 2 / > 5 000 € (hors IRSI,
 * en aval duquel se trouve la CIDECOP).
 */
const Q_TRANCHE: NodeId = 'q_tranche';
const TRANCHE_PAR_INDEX: Record<number, Tranche> = {
  0: 'tranche_1',
  1: 'tranche_2',
  2: 'hors_irsi',
};

/**
 * Tranche IRSI retenue, DÉRIVÉE de l'option choisie au nœud `q_tranche` (dette
 * T4). `undefined` tant que `q_tranche` n'a pas été franchi. Le `wizard` reste
 * autoritaire : cette valeur est recalculée, jamais relue d'une colonne.
 */
export function tranche(state: WizardState): Tranche | undefined {
  const step = state.steps.find((s) => s.nodeId === Q_TRANCHE);
  if (!step || step.optionIndex === undefined) return undefined;
  return TRANCHE_PAR_INDEX[step.optionIndex];
}

/** Tranche déduite d'un montant d'assiette HT, par comparaison aux seuils IRSI. */
export function trancheDepuisMontant(totalHt: number): Tranche {
  const t1 = parametres.plafond_tranche_1_ht ?? 1600;
  const t2 = parametres.plafond_convention_ht ?? 5000;
  if (totalHt <= t1) return 'tranche_1';
  if (totalHt <= t2) return 'tranche_2';
  return 'hors_irsi';
}

/**
 * Alerte NON bloquante (dette T5) : vrai si le total d'assiette saisi place le
 * local dans une tranche DIFFÉRENTE de celle choisie au wizard. Le choix du
 * gestionnaire (wizard) fait foi ; l'assiette n'est qu'un justificatif. Seuils
 * lus depuis `parametres` (jamais en dur). Faux si assiette absente ou tranche
 * non encore choisie (rien à signaler).
 */
export function divergenceAssietteTranche(
  state: WizardState,
  totalHt: number | undefined,
): boolean {
  if (totalHt === undefined || Number.isNaN(totalHt)) return false;
  const choisie = tranche(state);
  if (!choisie) return false;
  return trancheDepuisMontant(totalHt) !== choisie;
}

// --- Reconstruction depuis une vue persistée -----------------------------

/**
 * Reconstruit un `WizardState` ordonné à partir d'une map `reponses`
 * (nœud -> libellé) et du nœud courant - utile pour réhydrater un brouillon
 * sérialisé au format §5. Rejoue le parcours depuis le nœud initial.
 */
export function rebuild(reponsesMap: Record<NodeId, string>, noeudCourant: NodeId): WizardState {
  const steps: WizardState['steps'] = [];
  let current = noeudInitial;
  const guard = new Set<NodeId>();
  while (current !== noeudCourant) {
    if (guard.has(current)) {
      throw new Error(`rebuild : boucle détectée sur « ${current} ».`);
    }
    guard.add(current);
    const node = getNode(current);
    if (node.type === 'question') {
      const label = reponsesMap[current];
      const idx = node.options.findIndex((o) => o.label === label);
      if (idx < 0) {
        throw new Error(`rebuild : réponse manquante/inconnue pour « ${current} ».`);
      }
      steps.push({ nodeId: current, optionIndex: idx });
      current = node.options[idx]!.suivant;
    } else if (node.type === 'etape') {
      steps.push({ nodeId: current });
      current = node.suivant;
    } else {
      throw new Error(`rebuild : nœud terminal « ${current} » atteint avant « ${noeudCourant} ».`);
    }
  }
  return { steps, current };
}

// --- Utilitaires par libellé (UI & tests) ---------------------------------

/** Index de l'option d'un nœud question par libellé exact. */
export function optionIndexByLabel(nodeId: NodeId, label: string): number {
  const node = getNode(nodeId);
  if (node.type !== 'question') return -1;
  return node.options.findIndex((o) => o.label === label);
}

/** Répond au nœud courant en désignant l'option par son libellé exact. */
export function answerByLabel(state: WizardState, label: string): WizardState {
  const idx = optionIndexByLabel(state.current, label);
  if (idx < 0) {
    throw new Error(`answerByLabel : option « ${label} » absente de « ${state.current} ».`);
  }
  return answer(state, state.current, idx);
}

function chosenOption(nodeId: NodeId, optionIndex: number | undefined): NodeOption | undefined {
  if (optionIndex === undefined) return undefined;
  const node = getNode(nodeId);
  return node.type === 'question' ? node.options[optionIndex] : undefined;
}
