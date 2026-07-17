import { describe, it, expect } from 'vitest';
import {
  advance,
  answerByLabel,
  courriersRecommandes,
  currentNode,
  gestionnaireNode,
  initialState,
  settleForward,
} from './wizard';
import { planifierCourriers } from './plan-courriers';
import type { WizardState } from '../types';

// --- Navigation data-driven (meme utilitaire que explication.test.ts) ---

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

/** Ids planifiés, dans l'ordre, pour comparer sans bruit. */
const ids = (l: { courrier: { id: string } }[]) => l.map((p) => p.courrier.id);

/**
 * Le cas de référence de Sekou : DDE classique, fuite chez un copropriétaire qui
 * n'est pas assuré -> subsidiarité, l'assureur de l'immeuble gère.
 */
function wizardDdeClassiqueImmeubleGestionnaire(): WizardState {
  return parcours([
    'Oui, dégât des eaux',
    'Non',
    CONFIG_DEUX_PRIVATIFS,
    'Oui, occupé',
    'Le (co)propriétaire lui-même',
    'Non',
  ]);
}

/** Tranche 1 / cas 1 : c'est l'assureur du copropriétaire occupant qui gère. */
function wizardImmeubleNonGestionnaire(): WizardState {
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

describe('planifierCourriers', () => {
  it('DDE classique, immeuble gestionnaire -> le jour J on envoie C2 puis C1, rien d’autre', () => {
    const w = wizardDdeClassiqueImmeubleGestionnaire();
    expect(gestionnaireNode(w)?.gestionnaire).toBe('assureur_immeuble');

    const plan = planifierCourriers(w);

    // La règle métier validée : invitation à déclarer + déclaration à l'assureur
    // de l'immeuble. Dans cet ordre. Et C5 n'est PAS du jour J.
    expect(ids(plan.maintenant)).toEqual(['C2', 'C1']);
    expect(ids(plan.plusTard)).not.toContain('C2');
    expect(ids(plan.plusTard)).not.toContain('C1');
  });

  it('quand l’immeuble n’est pas gestionnaire, seul C2 part le jour J', () => {
    const w = wizardImmeubleNonGestionnaire();
    expect(gestionnaireNode(w)?.gestionnaire).not.toBe('assureur_immeuble');

    const plan = planifierCourriers(w);
    expect(ids(plan.maintenant)).toEqual(['C2']);
  });

  it('« maintenant » n’a pas de déclencheur, « plus tard » en a toujours un', () => {
    const plan = planifierCourriers(wizardDdeClassiqueImmeubleGestionnaire());

    for (const p of plan.maintenant) {
      expect(p.moment).toBe('maintenant');
      expect(p.declencheur).toBeUndefined();
      expect(p.quand.trim()).toBeTruthy();
    }
    for (const p of plan.plusTard) {
      expect(p.moment).toBe('plus_tard');
      expect(p.declencheur?.trim(), `déclencheur manquant sur ${p.courrier.id}`).toBeTruthy();
      expect(p.quand.trim()).toBeTruthy();
    }
  });

  it('les phrases « plus tard » restent lisibles : ni jargon d’article, ni « J+ » brut', () => {
    // Elles s'adressent à un gestionnaire pressé : les références d'articles
    // restent dans le détail du courrier, pas dans le résumé.
    for (const w of [
      wizardDdeClassiqueImmeubleGestionnaire(),
      wizardImmeubleNonGestionnaire(),
    ]) {
      for (const p of planifierCourriers(w).plusTard) {
        expect(p.declencheur, `${p.courrier.id} cite un article`).not.toMatch(
          /IRSI|C\. assur|art\.|Annexe/i,
        );
        expect(p.declencheur, `${p.courrier.id} n’est pas une phrase`).toMatch(/^(Si|Quand)\b/);
      }
    }
  });

  // --- L'invariant : on RÉORGANISE, on ne perd rien ---

  describe('tout courrier déclenché est dans exactement une des deux listes', () => {
    const cas: Record<string, () => WizardState> = {
      'DDE classique (immeuble gestionnaire)': wizardDdeClassiqueImmeubleGestionnaire,
      'tranche 1, cas 1': wizardImmeubleNonGestionnaire,
      'parcours neuf (étape d’urgence)': () => avancerJusquaChoix(initialState()),
      'parties communes seules': () =>
        parcours(['Oui, dégât des eaux', 'Non', 'Les parties communes seules']),
      'cause exclue (hors IRSI)': () =>
        parcours([
          'Oui, dégât des eaux',
          'Oui, cause exclue (ou pluralité avec une cause exclue)',
        ]),
    };

    for (const [nom, build] of Object.entries(cas)) {
      it(nom, () => {
        const w = build();
        const attendus = courriersRecommandes(w);
        const plan = planifierCourriers(w);
        const obtenus = [...ids(plan.maintenant), ...ids(plan.plusTard)];

        // Aucun perdu, aucun dupliqué, aucun ajouté.
        expect([...obtenus].sort()).toEqual([...attendus].sort());
        expect(new Set(obtenus).size).toBe(obtenus.length);
      });
    }
  });

  it('n’invente aucun courrier : ce qui n’est pas déclenché n’apparaît nulle part', () => {
    // Sortie précoce : le parcours ne déclenche que l'étape d'urgence.
    const w = parcours([
      'Oui, dégât des eaux',
      'Oui, cause exclue (ou pluralité avec une cause exclue)',
    ]);
    const plan = planifierCourriers(w);
    const tous = [...ids(plan.maintenant), ...ids(plan.plusTard)];

    expect(tous).not.toContain('C4'); // RDF non organisée
    expect(tous).not.toContain('C6'); // aucune convocation d'expertise
  });
});
