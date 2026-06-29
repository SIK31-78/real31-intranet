import { describe, it, expect } from 'vitest';
import { initialState } from './wizard';
import { syntheseDossierSinistre } from './synthese';
import type { DossierState } from '../state/store';

describe('syntheseDossierSinistre', () => {
  it('inclut la référence, l’immeuble et le local', () => {
    const state: DossierState = {
      referenceInterne: 'SIN-2026-0001',
      date: '2026-06-29',
      immeuble: { nom: 'Résidence Test', adresse: '1 rue de la Démo' },
      descriptif: '',
      statut: 'brouillon',
      locaux: [{ id: 'l1', libelle: 'Appartement 3B', wizard: initialState() }],
      activeLocalId: 'l1',
    };

    const texte = syntheseDossierSinistre(state);

    expect(texte).toContain('SIN-2026-0001');
    expect(texte).toContain('Résidence Test');
    expect(texte).toContain('Appartement 3B');
    // Parcours non terminé -> mention explicite, pas d'invention de résultat.
    expect(texte).toContain('parcours en cours');
  });
});
