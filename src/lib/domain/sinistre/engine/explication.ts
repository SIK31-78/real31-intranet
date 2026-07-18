/**
 * Explication du raisonnement conventionnel - « pourquoi CET assureur gestionnaire ? ».
 *
 * Le moteur connaît déjà le chemin parcouru ; jusqu'ici il ne l'exposait pas, et
 * l'écran de résultat annonçait un assureur gestionnaire sans dire d'où il sortait.
 * Ce module RESTITUE ce chemin, sans rien y ajouter :
 *   - la règle appliquée = les `references` portées par le nœud gestionnaire,
 *   - les motifs = les questions/réponses RÉELLES du parcours qui ont mené à ce nœud,
 *   - le cas du tableau IRSI 2.1.3 = le `cas_213` porté par l'option choisie.
 *
 * Aucune règle métier n'est codée ici : tout vient de l'arbre. Fonction PURE.
 */

import { getNode, pathOf, tranche, type Tranche } from './wizard';
import type { EtapeNode, NodeOption, WizardState } from '../types';

/** Une question du parcours et la réponse qui y a été donnée. */
export interface MotifGestionnaire {
  question: string;
  reponse: string;
}

export interface ExplicationGestionnaire {
  /** Token brut du nœud (ex. `assureur_immeuble`) - l'UI le met en forme. */
  gestionnaire: string;
  /** Titre du nœud gestionnaire (ex. « Assureur gestionnaire : ... (subsidiarité) »). */
  titre: string;
  /** Rôle du gestionnaire tel que décrit par la donnée, s'il est porté par le nœud. */
  role?: string;
  /** Cas du tableau IRSI 2.1.3 retenu AVANT d'atteindre ce nœud, le cas échéant. */
  cas213?: number;
  /** Articles fondant la désignation (portés par le nœud). */
  references: string[];
  /** Les réponses qui ont déterminé la désignation, dans l'ordre du parcours. */
  motifs: MotifGestionnaire[];
  /** Tranche IRSI - CONTEXTE (décidée après la désignation), pas un motif. */
  tranche?: Tranche;
  /**
   * Vrai si la désignation repose sur un « Je ne sais pas » (option `incertitude`)
   * et non sur un fait constaté : le résultat est provisoire (E-2).
   */
  provisoire: boolean;
}

/** Option choisie à un pas, si ce pas est bien une question répondue. */
function optionChoisie(nodeId: string, optionIndex: number | undefined): NodeOption | undefined {
  if (optionIndex === undefined) return undefined;
  const node = getNode(nodeId);
  return node.type === 'question' ? node.options[optionIndex] : undefined;
}

/**
 * Explique la désignation de l'assureur gestionnaire pour un parcours donné.
 *
 * `undefined` tant qu'aucun nœud gestionnaire n'a été traversé (sortie précoce,
 * parcours en cours) : on n'explique jamais une désignation qui n'a pas eu lieu.
 */
export function expliquerGestionnaire(w: WizardState): ExplicationGestionnaire | undefined {
  const path = pathOf(w);

  // Dernier nœud `etape` porteur d'un gestionnaire (même sélection que
  // `gestionnaireNode`), mais on retient AUSSI son rang : les motifs sont les
  // réponses qui le PRÉCÈDENT, pas celles données après (tranche, RC pro...).
  let index = -1;
  let node: EtapeNode | undefined;
  for (let i = 0; i < path.length; i++) {
    const n = getNode(path[i]!);
    if (n.type === 'etape' && n.gestionnaire) {
      index = i;
      node = n;
    }
  }
  if (!node?.gestionnaire || index < 0) return undefined;

  const motifs: MotifGestionnaire[] = [];
  let cas: number | undefined;
  for (let i = 0; i < index; i++) {
    const step = w.steps[i];
    if (!step) continue;
    const question = getNode(step.nodeId);
    if (question.type !== 'question') continue;
    const opt = optionChoisie(step.nodeId, step.optionIndex);
    if (!opt) continue;
    motifs.push({ question: question.question, reponse: opt.label });
    if (opt.cas_213 !== undefined) cas = opt.cas_213;
  }

  // Provisoire : c'est le DERNIER pas avant le nœud gestionnaire qui a décidé de
  // l'orientation. S'il porte `incertitude`, la désignation repose sur un doute.
  const decisif = index > 0 ? w.steps[index - 1] : undefined;
  const provisoire = decisif
    ? optionChoisie(decisif.nodeId, decisif.optionIndex)?.incertitude === true
    : false;

  const t = tranche(w);

  return {
    gestionnaire: node.gestionnaire,
    titre: node.titre,
    ...(node.role_gestionnaire ? { role: node.role_gestionnaire } : {}),
    ...(cas !== undefined ? { cas213: cas } : {}),
    references: node.references ?? [],
    motifs,
    ...(t ? { tranche: t } : {}),
    provisoire,
  };
}
