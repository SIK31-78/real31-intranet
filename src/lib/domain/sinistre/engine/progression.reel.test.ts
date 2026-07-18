/**
 * Garde-fous sur le VRAI arbre de décision (pas de mock ici).
 * On ne fige aucun chiffre - l'arbre bouge - mais on vérifie que le compteur ne
 * peut jamais mentir : total >= numéro, et aucune explosion sur un nœud.
 */
import { describe, it, expect } from 'vitest';
import { nodes, noeudInitial } from '../data';
import { bornesRestantes, progression } from './progression';
import {
  advance,
  answerByLabel,
  currentNode,
  initialState,
  settleForward,
} from './wizard';
import type { WizardState } from '../types';

function avancerJusquaChoix(w: WizardState): WizardState {
  let s = settleForward(w);
  while (currentNode(s).type === 'etape') s = settleForward(advance(s));
  return s;
}

describe('progression sur l’arbre réel', () => {
  it('calcule des bornes cohérentes depuis chaque nœud (aucune boucle infinie)', () => {
    for (const id of Object.keys(nodes)) {
      const b = bornesRestantes(id);
      expect(b, `bornes indisponibles depuis « ${id} »`).not.toBeNull();
      expect(b!.min).toBeLessThanOrEqual(b!.max);
    }
  });

  it('le nœud initial est atteignable et son parcours reste borné', () => {
    const b = bornesRestantes(noeudInitial);
    expect(b!.min).toBeGreaterThan(0);
    expect(b!.max).toBeGreaterThanOrEqual(b!.min);
  });

  it('sur un DDE classique, le total annoncé n’est jamais inférieur au numéro affiché', () => {
    // On répond systématiquement la 1re option : peu importe le chemin, l'invariant tient.
    let w = avancerJusquaChoix(initialState());
    let garde = 0;
    while (currentNode(w).type === 'question' && garde++ < 30) {
      const p = progression(w);
      expect(p.numero).toBe(p.repondues + 1);
      if (p.total !== undefined) expect(p.total).toBeGreaterThanOrEqual(p.numero!);
      const node = currentNode(w);
      if (node.type !== 'question') break;
      w = avancerJusquaChoix(answerByLabel(w, node.options[0]!.label));
    }
    expect(garde).toBeLessThan(30); // le parcours se termine (pas de boucle)
  });
});
