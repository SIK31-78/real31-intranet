import { describe, it, expect } from 'vitest';
import {
  advance,
  answerByLabel,
  cas213,
  courriersRecommandes,
  currentNode,
  gestionnaireNode,
  initialState,
  isTerminal,
  resultatNode,
  settleForward,
  tranche,
} from './wizard';
import { syntheseDossierSinistre } from './synthese';
import type { DossierState, LocalSinistre, WizardState } from '../types';

// --- Utilitaires de navigation (data-driven, aucun id de noeud en dur cote test) ---

/**
 * Franchit toutes les etapes (visibles ou transparentes) jusqu'a la prochaine
 * question ou le noeud terminal. On ne pilote QUE les questions (par libelle) :
 * les etapes sont des passages sans choix, donc traversees automatiquement.
 */
function avancerJusquaChoix(w: WizardState): WizardState {
  let s = settleForward(w);
  while (currentNode(s).type === 'etape') s = settleForward(advance(s));
  return s;
}

/** Joue une suite de reponses (par libelle) en traversant les etapes au passage. */
function parcours(labels: string[]): WizardState {
  let w = avancerJusquaChoix(initialState());
  for (const label of labels) {
    w = avancerJusquaChoix(answerByLabel(w, label));
  }
  return w;
}

/**
 * Parcours TERMINE menant a un sinistre IRSI Tranche 1, cas 1 du tableau 2.1.3
 * (gestionnaire = assureur du coproprietaire occupant). Construit a partir des
 * vrais libelles de l'arbre (pas de fixture inventee).
 */
function wizardTranche1Cas1(): WizardState {
  return parcours([
    'Oui, dégât des eaux', // q_nature
    'Non', // q_cause_exclue
    'Oui', // q_origine
    'Oui, au moins deux assureurs', // q_deux_assureurs
    'Local privatif', // q_local_type
    'Oui, occupé', // q_occupation
    'Le (co)propriétaire lui-même', // q_qualite_occupant
    'Oui', // q_co_assure -> r_gest_co (cas_213 = 1)
    'Oui', // q_rdf_necessaire
    '≤ 1 600 € HT (tranche 1)', // q_tranche
    'Non', // q_rcpro_t1 -> r_t1
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

describe('navigation -> sélecteurs (sanity)', () => {
  it('le parcours tranche 1 cas 1 est terminé et porte gestionnaire/cas/tranche/recours', () => {
    const w = wizardTranche1Cas1();
    expect(isTerminal(w)).toBe(true);
    expect(cas213(w)).toBe(1);
    expect(tranche(w)).toBe('tranche_1');
    const gest = gestionnaireNode(w);
    expect(gest?.gestionnaire).toBe('assureur_coproprietaire_occupant');
    const res = resultatNode(w);
    expect(res?.recours).toBeTruthy();
    expect(res?.prise_en_charge?.length).toBeGreaterThan(0);
    // Au moins un courrier recommandé est déclenché sur ce chemin complet.
    expect(courriersRecommandes(w).length).toBeGreaterThan(0);
  });
});

describe('syntheseDossierSinistre', () => {
  it('inclut la référence, l’immeuble et le local', () => {
    const state = dossier([local('l1', 'Appartement 3B', initialState())], {
      referenceInterne: 'SIN-2026-0001',
      immeuble: { nom: 'Résidence Test', adresse: '1 rue de la Démo' },
    });

    const texte = syntheseDossierSinistre(state);

    expect(texte).toContain('SIN-2026-0001');
    expect(texte).toContain('Résidence Test');
    expect(texte).toContain('Appartement 3B');
    // Parcours non terminé -> mention explicite, pas d'invention de résultat.
    expect(texte).toContain('parcours en cours');
  });

  it('parcours terminé : restitue gestionnaire, cas 2.1.3, tranche et courriers (digest, sans les paves juridiques)', () => {
    const w = wizardTranche1Cas1();
    const res = resultatNode(w)!;
    const state = dossier([local('l1', 'Appartement 3B', w)]);

    const texte = syntheseDossierSinistre(state);

    // En-tête : tout vient des données saisies (rien d'inventé).
    expect(texte).toContain('SIN-2026-0042');
    expect(texte).toContain('Résidence Foch');
    expect(texte).toContain('Date du sinistre : 2026-06-29');

    // Résultat dérivé : titre du noeud terminal réel.
    expect(texte).toContain(res.titre);
    // Gestionnaire désigné (souligné lisible : underscores remplacés par espaces).
    expect(texte).toContain('assureur coproprietaire occupant');
    // Cas du tableau IRSI 2.1.3.
    expect(texte).toContain('cas 1 du tableau IRSI 2.1.3');
    // Tranche.
    expect(texte).toContain('Tranche 1 IRSI');
    // Digest : les paves juridiques (prise en charge, recours) ne sont PAS recopies
    // dans la synthese du journal (ils restent sur l'ecran resultat de l'assistant).
    expect(texte).not.toContain('Prise en charge :');
    expect(texte).not.toContain('Recours :');
    // Courriers recommandés.
    expect(texte).toContain('Courriers recommandés :');
    expect(texte).not.toContain('parcours en cours');
  });

  it('multi-locaux : une ligne de synthèse par local, dans l’ordre', () => {
    const state = dossier([
      local('l1', 'Appartement 3B', wizardTranche1Cas1()),
      local('l2', 'Cave 12', initialState()),
    ]);

    const texte = syntheseDossierSinistre(state);

    expect(texte).toContain('Appartement 3B');
    expect(texte).toContain('Cave 12');
    // Le 2e local non terminé reste annoncé comme tel (pas de résultat fabriqué).
    expect(texte).toContain('parcours en cours');
    // Ordre préservé : le 1er local apparaît avant le 2e.
    expect(texte.indexOf('Appartement 3B')).toBeLessThan(texte.indexOf('Cave 12'));
  });

  it('ne fabrique aucune donnée absente : pas de date/montant/nom hors saisie', () => {
    // Dossier sans date ni nom d'immeuble, local non terminé : la synthèse ne doit
    // inventer ni date de sinistre, ni montant, ni gestionnaire.
    const state = dossier([local('l1', 'Local A', initialState())], {
      date: '',
      immeuble: { nom: '', adresse: '' },
    });

    const texte = syntheseDossierSinistre(state);

    expect(texte).not.toContain('Date du sinistre :');
    expect(texte).not.toContain('Immeuble :');
    expect(texte).not.toContain('Assureur gestionnaire :');
    expect(texte).not.toContain('Tranche :');
    expect(texte).not.toContain('Recours :');
    expect(texte).not.toContain('€');
    expect(texte).toContain('parcours en cours');
  });
});
