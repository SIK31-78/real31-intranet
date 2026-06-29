/**
 * Synthèse texte d'un dossier sinistre, destinée à être reportée dans le JOURNAL
 * d'un Dossier de l'intranet (incrément 2, ancrage option C). Fonction PURE : ne
 * fait que dériver un résumé factuel depuis l'état du dossier via les sélecteurs
 * de l'engine - aucune invention, aucun effet de bord.
 */

import { courriers } from '../data';
import {
  cas213,
  courriersRecommandes,
  gestionnaireNode,
  resultatNode,
  tranche,
  type Tranche,
} from './wizard';
import type { DossierState } from '../state/store';
import type { LocalSinistre } from '../types';

const TRANCHE_LABEL: Record<Tranche, string> = {
  tranche_1: 'Tranche 1 IRSI',
  tranche_2: 'Tranche 2 IRSI (convention)',
  hors_irsi: 'Hors IRSI (> plafond convention)',
};

// Titre lisible d'un courrier par son id (les déclencheurs renvoient des ids).
const TITRE_COURRIER = new Map(courriers.map((c) => [c.id, c.titre]));

/** Résumé d'un local : résultat atteint, gestionnaire désigné, tranche, courriers. */
function syntheseLocal(local: LocalSinistre): string {
  const w = local.wizard;
  const res = resultatNode(w);
  const lignes: string[] = [
    `- ${local.libelle || 'Local'} : ${res ? res.titre : 'parcours en cours (non terminé)'}`,
  ];

  const gest = gestionnaireNode(w);
  if (gest?.gestionnaire) {
    const cas = cas213(w);
    lignes.push(
      ` Assureur gestionnaire : ${gest.gestionnaire.replace(/_/g, ' ')}` +
        (cas !== undefined ? ` (cas ${cas} du tableau IRSI 2.1.3)` : ''),
    );
  }

  const t = tranche(w);
  if (t) lignes.push(` Tranche : ${TRANCHE_LABEL[t]}`);

  if (res?.prise_en_charge?.length) {
    lignes.push(` Prise en charge : ${res.prise_en_charge.join(' ; ')}`);
  }
  if (res?.recours) lignes.push(` Recours : ${res.recours}`);

  const titres = courriersRecommandes(w).map((id) => TITRE_COURRIER.get(id) ?? id);
  if (titres.length) lignes.push(` Courriers recommandés : ${titres.join(', ')}`);

  return lignes.join('\n');
}

/**
 * Synthèse complète d'un dossier sinistre (multi-locaux). Texte multi-lignes prêt
 * à être déposé tel quel dans une note de journal de Dossier.
 */
export function syntheseDossierSinistre(state: DossierState): string {
  const entete = [
    `Synthèse assistant sinistre (DDE) - ${state.referenceInterne}`,
    state.immeuble?.nom ? `Immeuble : ${state.immeuble.nom}` : '',
    state.date ? `Date du sinistre : ${state.date}` : '',
  ].filter(Boolean);

  const corps = state.locaux.map(syntheseLocal);
  return [...entete, '', ...corps].join('\n');
}
