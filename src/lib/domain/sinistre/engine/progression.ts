/**
 * Progression honnête du parcours (domaine pur : aucun import React).
 *
 * L'arbre de décision est un GRAPHE, pas une liste : selon les réponses, le
 * parcours fait 3 ou 8 questions. Afficher un total fixe serait un mensonge.
 * On calcule donc, depuis le nœud courant :
 *  - les questions DÉJÀ répondues (dérivées des pas franchis) ;
 *  - le reste, en parcourant le graphe vers les nœuds `resultat` et en comptant
 *    les nœuds `question` (les `etape` ne comptent pas : ce ne sont pas des
 *    questions). Les branches divergent - on obtient un MIN et un MAX.
 *
 * RÈGLE : un compteur qui ment est pire que pas de compteur. Dès que le calcul
 * est impossible (nœud inconnu, cycle) ou que l'incertitude est trop large,
 * on ne renvoie AUCUN total - l'UI n'affiche alors que le numéro courant.
 */

import { nodes } from '../data';
import type { DecisionNode, NodeId, WizardState } from '../types';

/**
 * Au-delà de ce facteur entre la borne basse et la borne haute, annoncer un
 * total (même approximatif) désinformerait plus qu'il n'informerait : « 3 sur
 * ~9 » quand le parcours peut s'arrêter à 4 n'aide personne.
 */
const FACTEUR_INCERTITUDE_MAX = 2;

export interface Bornes {
  /** Nombre minimal de questions restantes (nœud courant inclus s'il est une question). */
  min: number;
  /** Nombre maximal de questions restantes (nœud courant inclus s'il est une question). */
  max: number;
}

export interface Progression {
  /** Questions déjà répondues sur le chemin parcouru. */
  repondues: number;
  /** Numéro (1-based) de la question affichée ; absent si le nœud courant n'est pas une question. */
  numero?: number;
  /** Total annonçable, ou `undefined` si aucun chiffre honnête n'est calculable. */
  total?: number;
  /** Vrai si `total` est une estimation (branches de longueurs différentes) - à afficher avec « ~ ». */
  approximatif: boolean;
}

/** Successeurs directs d'un nœud (un `resultat` est terminal). */
function successeurs(node: DecisionNode): NodeId[] {
  if (node.type === 'question') return node.options.map((o) => o.suivant);
  if (node.type === 'etape') return [node.suivant];
  return [];
}

/**
 * Bornes du nombre de questions restant à poser depuis `depart` (inclus) et
 * jusqu'à un `resultat`. `null` si le calcul n'est pas fiable : nœud introuvable
 * ou cycle dans le sous-graphe atteignable (le parcours pourrait boucler, aucun
 * total n'a de sens).
 */
export function bornesRestantes(depart: NodeId): Bornes | null {
  const memo = new Map<NodeId, Bornes>();
  const enCours = new Set<NodeId>();

  function visiter(id: NodeId): Bornes | null {
    const connu = memo.get(id);
    if (connu) return connu;
    // Nœud déjà dans la pile courante : cycle -> aucun total honnête.
    if (enCours.has(id)) return null;

    const node = nodes[id];
    if (!node) return null; // donnée incohérente : on préfère ne rien annoncer

    if (node.type === 'resultat') {
      const bornes: Bornes = { min: 0, max: 0 };
      memo.set(id, bornes);
      return bornes;
    }

    enCours.add(id);
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const suivant of successeurs(node)) {
      const b = visiter(suivant);
      if (!b) {
        enCours.delete(id);
        return null;
      }
      if (b.min < min) min = b.min;
      if (b.max > max) max = b.max;
    }
    enCours.delete(id);

    if (min === Number.POSITIVE_INFINITY) return null; // ni successeur ni résultat

    const poids = node.type === 'question' ? 1 : 0;
    const bornes: Bornes = { min: min + poids, max: max + poids };
    memo.set(id, bornes);
    return bornes;
  }

  return visiter(depart);
}

/**
 * Progression affichable pour l'état d'un local.
 *
 * Le total vaut `repondues + max` quand les branches divergent : on annonce la
 * borne HAUTE, jamais la basse. Promettre « sur ~4 » puis en poser 7 trahit la
 * confiance ; annoncer ~7 et terminer en 4, c'est une bonne surprise.
 */
export function progression(state: WizardState): Progression {
  const repondues = state.steps.filter((s) => nodes[s.nodeId]?.type === 'question').length;
  const courant = nodes[state.current];
  const base: Progression = { repondues, approximatif: false };
  if (courant?.type === 'question') base.numero = repondues + 1;

  const bornes = bornesRestantes(state.current);
  if (!bornes) return base; // calcul impossible / cycle -> pas de nombre
  if (bornes.min === 0 && bornes.max === 0) return base; // plus de question devant

  // Incertitude trop large : mieux vaut aucun total qu'un total trompeur.
  if (bornes.max > bornes.min * FACTEUR_INCERTITUDE_MAX) return base;

  return {
    ...base,
    total: repondues + bornes.max,
    approximatif: bornes.min !== bornes.max,
  };
}
