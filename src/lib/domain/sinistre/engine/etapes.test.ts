import { describe, it, expect } from 'vitest';
import {
  advance,
  answerByLabel,
  courriersRecommandes,
  currentNode,
  initialState,
  isTerminal,
  resultatNode,
  settleForward,
} from './wizard';
import { projeterEtapesDepuisParcours } from './etapes';
import type { DossierState, LocalSinistre, WizardState } from '../types';

// --- Navigation data-driven (copie de synthese.test.ts : on ne pilote que les
//     questions par libelle ; les etapes sont traversees automatiquement). ---

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

/** Parcours TERMINE : IRSI Tranche 1, cas 1 (resultat r_t1 : recours present). */
function wizardTranche1Cas1(): WizardState {
  return parcours([
    'Oui, dégât des eaux',
    'Non',
    'Non',
    'Oui',
    'Oui, au moins deux assureurs',
    'Local privatif',
    'Oui, occupé',
    'Le (co)propriétaire lui-même',
    'Oui',
    'Oui',
    '≤ 1 600 € HT (tranche 1)',
    'Non',
  ]);
}

function local(id: string, libelle: string, wizard: WizardState): LocalSinistre {
  return { id, libelle, wizard };
}

function dossier(locaux: LocalSinistre[], over: Partial<DossierState> = {}): DossierState {
  return {
    referenceInterne: 'SIN-2026-0042',
    date: '2026-06-29',
    immeuble: { nom: 'Résidence Foch', adresse: '31 avenue Foch' },
    descriptif: '',
    statut: 'brouillon',
    locaux,
    activeLocalId: locaux[0]!.id,
    ...over,
  };
}

describe('projeterEtapesDepuisParcours', () => {
  it('parcours terminé : une étape par courrier recommandé + jalon recours', () => {
    const w = wizardTranche1Cas1();
    expect(isTerminal(w)).toBe(true);

    const etapes = projeterEtapesDepuisParcours(dossier([local('l1', 'Appartement 3B', w)]));

    // Au moins une étape produite.
    expect(etapes.length).toBeGreaterThan(0);
    // Toutes non faites, sans assignation imposée.
    for (const e of etapes) {
      expect(e.fait).toBe(false);
      expect(e.assigneA).toBeUndefined();
      expect(e.id.length).toBeGreaterThan(0);
    }

    // Une étape "courrier" par courrier recommandé réel, avec son id dans le label.
    const recommandes = courriersRecommandes(w);
    expect(recommandes.length).toBeGreaterThan(0);
    for (const id of recommandes) {
      const etape = etapes.find((e) => e.id === `courrier-${id.toLowerCase()}`);
      expect(etape, `étape attendue pour le courrier ${id}`).toBeTruthy();
      expect(etape!.label).toContain(`Envoyer le courrier ${id}`);
    }

    // r_t1 porte recours -> jalon recours présent ; pas d'expertise sur ce résultat.
    const res = resultatNode(w)!;
    expect(res.recours).toBeTruthy();
    expect(etapes.some((e) => e.id === 'jalon-recours')).toBe(true);
    expect(res.expertise).toBeFalsy();
    expect(etapes.some((e) => e.id === 'jalon-expertise')).toBe(false);
  });

  it('parcours NON terminé : tableau vide (aucune invention)', () => {
    const etapes = projeterEtapesDepuisParcours(
      dossier([local('l1', 'Appartement 3B', initialState())]),
    );
    expect(etapes).toEqual([]);
  });

  it('multi-locaux identiques : pas de doublon (dédup par id stable)', () => {
    const etapes = projeterEtapesDepuisParcours(
      dossier([
        local('l1', 'Appartement 3B', wizardTranche1Cas1()),
        local('l2', 'Studio 2A', wizardTranche1Cas1()),
      ]),
    );
    const ids = etapes.map((e) => e.id);
    // Aucun id répété.
    expect(new Set(ids).size).toBe(ids.length);
    // Et le résultat est identique à un seul local terminé (rien de plus, rien de moins).
    const seul = projeterEtapesDepuisParcours(
      dossier([local('l1', 'Appartement 3B', wizardTranche1Cas1())]),
    );
    expect(ids).toEqual(seul.map((e) => e.id));
  });

  it('un local terminé + un local en cours : seules les étapes du terminé sortent', () => {
    const seulTermine = projeterEtapesDepuisParcours(
      dossier([local('l1', 'Appartement 3B', wizardTranche1Cas1())]),
    );
    const mixte = projeterEtapesDepuisParcours(
      dossier([
        local('l1', 'Appartement 3B', wizardTranche1Cas1()),
        local('l2', 'Cave 12', initialState()),
      ]),
    );
    expect(mixte.map((e) => e.id)).toEqual(seulTermine.map((e) => e.id));
  });
});
