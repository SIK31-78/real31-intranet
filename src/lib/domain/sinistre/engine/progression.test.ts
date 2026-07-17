import { describe, it, expect, vi } from 'vitest';
import type { DecisionNode } from '../types';

// Arbre SYNTHÉTIQUE : on teste la règle de comptage, pas le contenu métier.
// Chaque graphe est monté à la main pour isoler un cas (branches égales,
// branches inégales, étape transparente, cycle).
const arbre: Record<string, DecisionNode> = {
  // --- Branches de MÊME longueur : min == max ---
  q1: {
    type: 'question',
    phase: '1 - test',
    question: 'Première ?',
    options: [
      { label: 'a', suivant: 'q2' },
      { label: 'b', suivant: 'q2' },
    ],
  },
  q2: {
    type: 'question',
    phase: '1 - test',
    question: 'Deuxième ?',
    options: [
      { label: 'a', suivant: 'e1' },
      { label: 'b', suivant: 'e1' },
    ],
  },
  // Étape transparente entre deux questions : ne doit PAS compter.
  e1: { type: 'etape', phase: '1 - test', titre: 'Étape', suivant: 'q3', transparent: true },
  q3: {
    type: 'question',
    phase: '1 - test',
    question: 'Troisième ?',
    options: [
      { label: 'a', suivant: 'fin' },
      { label: 'b', suivant: 'fin' },
    ],
  },
  fin: { type: 'resultat', phase: 'Sortie', titre: 'Fin' },

  // --- Branches INÉGALES mais dans le rapport toléré : 2 vs 3 questions ---
  d1: {
    type: 'question',
    phase: '1 - test',
    question: 'Court ou long ?',
    options: [
      { label: 'court', suivant: 'd2' },
      { label: 'long', suivant: 'd3' },
    ],
  },
  d2: {
    type: 'question',
    phase: '1 - test',
    question: 'Fin proche ?',
    options: [{ label: 'oui', suivant: 'fin' }],
  },
  d3: {
    type: 'question',
    phase: '1 - test',
    question: 'Encore une ?',
    options: [{ label: 'oui', suivant: 'd2' }],
  },

  // --- Incertitude trop large : 1 question vs 4 (facteur > 2) ---
  l1: {
    type: 'question',
    phase: '1 - test',
    question: 'Sortie immédiate ?',
    options: [
      { label: 'oui', suivant: 'fin' },
      { label: 'non', suivant: 'l2' },
    ],
  },
  l2: {
    type: 'question',
    phase: '1 - test',
    question: 'l2 ?',
    options: [{ label: 'x', suivant: 'l3' }],
  },
  l3: {
    type: 'question',
    phase: '1 - test',
    question: 'l3 ?',
    options: [{ label: 'x', suivant: 'l4' }],
  },
  l4: {
    type: 'question',
    phase: '1 - test',
    question: 'l4 ?',
    options: [{ label: 'x', suivant: 'fin' }],
  },

  // --- Cycle : c1 -> c2 -> c1 ---
  c1: {
    type: 'question',
    phase: '1 - test',
    question: 'Boucle ?',
    options: [{ label: 'x', suivant: 'c2' }],
  },
  c2: {
    type: 'question',
    phase: '1 - test',
    question: 'Retour ?',
    options: [{ label: 'x', suivant: 'c1' }],
  },

  // --- Nœud pointant vers un id inexistant ---
  x1: {
    type: 'question',
    phase: '1 - test',
    question: 'Vers le vide ?',
    options: [{ label: 'x', suivant: 'inexistant' }],
  },

  // --- Étapes seules jusqu'au résultat (aucune question restante) ---
  s1: { type: 'etape', phase: '1 - test', titre: 'Info', suivant: 'fin' },
};

vi.mock('../data', () => ({
  get nodes() {
    return arbre;
  },
  noeudInitial: 'q1',
  parametres: {},
  courriers: [],
  lexique: {},
}));

const { bornesRestantes, progression } = await import('./progression');

describe('bornesRestantes', () => {
  it('compte les questions restantes, nœud courant inclus', () => {
    expect(bornesRestantes('q1')).toEqual({ min: 3, max: 3 });
    expect(bornesRestantes('q3')).toEqual({ min: 1, max: 1 });
    expect(bornesRestantes('fin')).toEqual({ min: 0, max: 0 });
  });

  it('ne compte PAS les nœuds `etape` comme des questions', () => {
    // e1 est une étape suivie de la seule question q3.
    expect(bornesRestantes('e1')).toEqual({ min: 1, max: 1 });
    // s1 -> résultat : aucune question devant.
    expect(bornesRestantes('s1')).toEqual({ min: 0, max: 0 });
  });

  it('rend un min et un max différents quand les branches divergent', () => {
    expect(bornesRestantes('d1')).toEqual({ min: 2, max: 3 });
  });

  it('rend null sur un graphe cyclique (aucune boucle infinie)', () => {
    expect(bornesRestantes('c1')).toBeNull();
  });

  it('rend null si un successeur est introuvable', () => {
    expect(bornesRestantes('x1')).toBeNull();
  });
});

describe('progression', () => {
  it('min == max : total exact, non approximatif', () => {
    const p = progression({ steps: [], current: 'q1' });
    expect(p).toEqual({ repondues: 0, numero: 1, total: 3, approximatif: false });
  });

  it('compte les questions déjà répondues, pas les étapes traversées', () => {
    const p = progression({
      steps: [
        { nodeId: 'q1', optionIndex: 0 },
        { nodeId: 'q2', optionIndex: 0 },
        { nodeId: 'e1' },
      ],
      current: 'q3',
    });
    expect(p).toEqual({ repondues: 2, numero: 3, total: 3, approximatif: false });
  });

  it('min != max : total approximatif calé sur la borne HAUTE', () => {
    const p = progression({ steps: [], current: 'd1' });
    expect(p).toEqual({ repondues: 0, numero: 1, total: 3, approximatif: true });
  });

  it('incertitude trop large (max > 2x min) : aucun total', () => {
    const p = progression({ steps: [], current: 'l1' });
    expect(p).toEqual({ repondues: 0, numero: 1, approximatif: false });
    expect(p.total).toBeUndefined();
  });

  it('graphe cyclique : aucun total, mais le numéro reste juste', () => {
    const p = progression({ steps: [{ nodeId: 'q1', optionIndex: 0 }], current: 'c1' });
    expect(p).toEqual({ repondues: 1, numero: 2, approximatif: false });
  });

  it('nœud résultat : ni numéro ni total', () => {
    const p = progression({ steps: [{ nodeId: 'q1', optionIndex: 0 }], current: 'fin' });
    expect(p).toEqual({ repondues: 1, approximatif: false });
  });
});
