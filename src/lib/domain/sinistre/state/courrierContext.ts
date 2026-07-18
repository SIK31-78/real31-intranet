/**
 * Pré-remplissage d'un courrier depuis le dossier en cours (CLAUDE.md §6.5).
 *
 * Les champs alimentables par la `FicheSinistre` sont pré-remplis ; les autres
 * restent vides (l'UI les surligne). Certaines conditions de blocs sont
 * pré-cochées lorsqu'elles sont déductibles du parcours (heuristiques de
 * couche UI, explicitement prévues au §6.5 - non codées dans le moteur pur).
 */

import { extractConditions, extractFields, type Conditions, type FieldValues } from '../engine/merge';
import { pathOf, resultatId } from '../engine/wizard';
import { resoudreChamp } from '../engine/mapping';
import type { DossierState, LocalSinistre } from '../types';

/** Nœuds dont la traversée pré-coche une condition de bloc. */
const CONDITION_PAR_NOEUD: Record<string, string> = {
  subsidiarite: 'r_gest_immeuble_subsidiaire',
};
/** Conditions pré-cochées selon le résultat atteint. */
const CONDITION_PAR_RESULTAT: Record<string, string> = {
  tranche_2: 'r_t2',
};

/** Conditions pré-cochées d'après la composition du dossier. */
const CONDITION_PAR_DOSSIER: Record<string, (state: DossierState, local: LocalSinistre) => boolean> = {
  // Il y a d'« autres parties » si plusieurs locaux ou plusieurs parties saisies.
  autres_parties: (state, local) => {
    const nbParties = (local.parties?.coproprietaire ? 1 : 0) + (local.parties?.occupant ? 1 : 0);
    return state.locaux.length > 1 || nbParties > 1;
  },
};

export interface ContexteCourrier {
  values: FieldValues;
  conditions: Conditions;
}

export function construireContexte(
  gabarit: string,
  state: DossierState,
  local: LocalSinistre,
): ContexteCourrier {
  const ctx = { state, local };
  const values: FieldValues = {};
  for (const champ of extractFields(gabarit)) {
    values[champ] = resoudreChamp(champ, ctx) ?? '';
  }

  const path = new Set(pathOf(local.wizard));
  const res = resultatId(local.wizard);
  const conditions: Conditions = {};
  for (const cond of extractConditions(gabarit)) {
    const parNoeud = CONDITION_PAR_NOEUD[cond];
    const parResultat = CONDITION_PAR_RESULTAT[cond];
    const parDossier = CONDITION_PAR_DOSSIER[cond];
    conditions[cond] =
      (parNoeud !== undefined && path.has(parNoeud)) ||
      (parResultat !== undefined && res === parResultat) ||
      (parDossier !== undefined && parDossier(state, local));
  }
  return { values, conditions };
}
