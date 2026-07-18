import { describe, it, expect } from 'vitest';
import {
  advance,
  answerByLabel,
  currentNode,
  gestionnaireNode,
  initialState,
  settleForward,
} from './wizard';
import { expliquerGestionnaire } from './explication';
import { courriers, nodes, noeudInitial } from '../data';
import type { WizardState } from '../types';

// --- Navigation data-driven (meme utilitaire que synthese.test.ts) ---

function avancerJusquaChoix(w: WizardState): WizardState {
  let s = settleForward(w);
  while (currentNode(s).type === 'etape') s = settleForward(advance(s));
  return s;
}

function parcours(labels: string[]): WizardState {
  let w = avancerJusquaChoix(initialState());
  for (const label of labels) {
    w = avancerJusquaChoix(answerByLabel(w, label));
  }
  return w;
}

const CONFIG_DEUX_PRIVATIFS = 'Deux parties privatives : le lot sinistré et un autre lot';

/** Tranche 1 / cas 1 : gestionnaire = assureur du coproprietaire occupant assure. */
function wizardTranche1Cas1(): WizardState {
  return parcours([
    'Oui, dégât des eaux',
    'Non',
    CONFIG_DEUX_PRIVATIFS,
    'Oui, occupé',
    'Le (co)propriétaire lui-même',
    'Oui',
    'Oui',
    '≤ 1 600 € HT (tranche 1)',
    'Non',
  ]);
}

/** Subsidiarite obtenue par un « Je ne sais pas » (option `incertitude`). */
function wizardSubsidiariteParDoute(): WizardState {
  return parcours([
    'Oui, dégât des eaux',
    'Non',
    CONFIG_DEUX_PRIVATIFS,
    'Oui, occupé',
    'Le (co)propriétaire lui-même',
    'Je ne sais pas',
  ]);
}

describe('expliquerGestionnaire', () => {
  it('restitue le gestionnaire, le cas 2.1.3 et les références du nœud atteint', () => {
    const w = wizardTranche1Cas1();
    const e = expliquerGestionnaire(w)!;

    expect(e).toBeTruthy();
    // Cohérent avec le sélecteur existant : on n'invente pas un autre gestionnaire.
    expect(e.gestionnaire).toBe(gestionnaireNode(w)?.gestionnaire);
    expect(e.gestionnaire).toBe('assureur_coproprietaire_occupant');
    expect(e.cas213).toBe(1);
    expect(e.references.length).toBeGreaterThan(0);
    expect(e.tranche).toBe('tranche_1');
    expect(e.provisoire).toBe(false);
  });

  it('les motifs sont les questions/réponses RÉELLES du parcours, en amont de la désignation', () => {
    const e = expliquerGestionnaire(wizardTranche1Cas1())!;

    expect(e.motifs.length).toBeGreaterThan(0);
    // Chaque motif est une vraie question de l'arbre, avec une option réelle.
    for (const m of e.motifs) {
      const node = Object.values(nodes).find(
        (n) => n.type === 'question' && n.question === m.question,
      );
      expect(node, `question inconnue : ${m.question}`).toBeTruthy();
      expect(
        node!.type === 'question' && node!.options.some((o) => o.label === m.reponse),
      ).toBe(true);
    }
    // La question d'assurance qui a décidé du cas 1 figure bien dans les motifs.
    expect(e.motifs.some((m) => m.question.includes('assuré'))).toBe(true);
    // En revanche, ce qui est postérieur à la désignation (tranche, RC pro) n'est PAS
    // présenté comme un motif de désignation.
    expect(e.motifs.some((m) => m.question.includes('montant estimé'))).toBe(false);
    expect(e.motifs.some((m) => m.question.includes('responsabilité civile'))).toBe(false);
  });

  it('marque « provisoire » une subsidiarité obtenue par « Je ne sais pas »', () => {
    const e = expliquerGestionnaire(wizardSubsidiariteParDoute())!;
    expect(e.gestionnaire).toBe('assureur_immeuble');
    expect(e.provisoire).toBe(true);
  });

  it('aucune désignation traversée -> undefined (pas d’explication fabriquée)', () => {
    // Parcours neuf (étape d'urgence) : aucun nœud gestionnaire atteint.
    expect(expliquerGestionnaire(initialState())).toBeUndefined();
    // Sortie précoce (cause exclue) : pas de gestionnaire conventionnel désigné.
    const horsIrsi = parcours([
      'Oui, dégât des eaux',
      'Oui, cause exclue (ou pluralité avec une cause exclue)',
    ]);
    expect(expliquerGestionnaire(horsIrsi)).toBeUndefined();
  });
});

// --- Intégrité du graphe : garde-fou après la refonte de l'arbre (questions
//     supprimées / fusionnées). Un `suivant` orphelin casserait le parcours en prod. ---

describe('intégrité de l’arbre de décision', () => {
  it('tous les `suivant` pointent vers un nœud existant', () => {
    for (const [id, node] of Object.entries(nodes)) {
      if (node.type === 'question') {
        for (const opt of node.options) {
          expect(nodes[opt.suivant], `${id} -> ${opt.suivant} introuvable`).toBeTruthy();
        }
      } else if (node.type === 'etape') {
        expect(nodes[node.suivant], `${id} -> ${node.suivant} introuvable`).toBeTruthy();
      }
    }
  });

  it('le nœud initial existe et tout nœud est atteignable depuis lui', () => {
    expect(nodes[noeudInitial]).toBeTruthy();

    const vus = new Set<string>();
    const file = [noeudInitial];
    while (file.length) {
      const id = file.pop()!;
      if (vus.has(id)) continue;
      vus.add(id);
      const node = nodes[id]!;
      if (node.type === 'question') file.push(...node.options.map((o) => o.suivant));
      else if (node.type === 'etape') file.push(node.suivant);
    }

    // Aucun nœud mort : la suppression de q_origine ne doit pas laisser d'orphelin.
    const orphelins = Object.keys(nodes).filter((id) => !vus.has(id));
    expect(orphelins, `nœuds inatteignables : ${orphelins.join(', ')}`).toEqual([]);
  });

  it('les questions supprimées/fusionnées ne sont plus dans l’arbre', () => {
    // Retours Sekou : question d'origine supprimée ; « deux assureurs » + « type de
    // local » fusionnés en une seule question à cas concrets (fin du doublon).
    expect(nodes['q_origine']).toBeUndefined();
    expect(nodes['q_deux_assureurs']).toBeUndefined();
    expect(nodes['q_local_type']).toBeUndefined();
    expect(nodes['q_configuration']).toBeTruthy();
  });

  it('q_configuration conserve toutes les issues des trois questions remplacées', () => {
    const q = nodes['q_configuration']!;
    expect(q.type).toBe('question');
    if (q.type !== 'question') return;
    const suivants = q.options.map((o) => o.suivant);
    // Ex-q_local_type : privatif -> occupation, communs -> gestionnaire immeuble, mixte.
    expect(suivants).toContain('q_occupation');
    expect(suivants).toContain('r_gest_immeuble_communs');
    expect(q.options.some((o) => o.mixte === true)).toBe(true);
    // Ex-q_deux_assureurs : un seul assureur -> gestion contractuelle directe.
    expect(suivants).toContain('r_assureur_unique');
    // Ex-q_origine : origine hors immeuble -> droit commun (branche préservée).
    expect(suivants).toContain('r_droit_commun');
  });

  it('chaque courrier dit QUAND l’envoyer, et ne se déclenche que sur des nœuds réels', () => {
    // « On ne sait pas à quel moment envoyer les courriers » : le moment est une donnée
    // (`delai`) affichée par l'UI. Elle doit exister pour TOUS les courriers, et les
    // déclencheurs ne doivent pas pointer vers des nœuds supprimés par la refonte.
    expect(courriers.length).toBeGreaterThan(0);
    for (const c of courriers) {
      expect(c.delai?.trim(), `délai manquant sur ${c.id}`).toBeTruthy();
      for (const n of c.declencheurs_noeuds) {
        expect(nodes[n], `${c.id} déclenché par un nœud inexistant : ${n}`).toBeTruthy();
      }
    }
  });

  it('la liste des exclusions IRSI est explicite dans la donnée (non vide)', () => {
    // « On ne sait pas quelles sont les clauses exclues » : la liste limitative doit
    // être portée par la donnée, pas noyée dans une prose ni absente.
    const q = nodes['q_cause_exclue']!;
    expect(q.type).toBe('question');
    if (q.type !== 'question') return;
    expect(q.aide_liste).toBeTruthy();
    expect(q.aide_liste!.items.length).toBeGreaterThan(0);
    expect(q.aide_liste!.titre).toMatch(/limitative/i);
  });
});
