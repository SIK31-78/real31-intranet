/**
 * Plan d'action séquencé des courriers - « qu'est-ce que j'envoie AUJOURD'HUI ? ».
 *
 * L'écran de résultat héritait d'un CATALOGUE de modèles (l'app d'origine servait
 * à ça) : 9 courriers alignés, tous au même niveau. Or à l'ouverture d'un dossier
 * on en envoie un ou deux ; les autres sont des SUITES conditionnelles, dont
 * certaines n'arriveront jamais.
 *
 * Ce module ne SÉLECTIONNE rien : la sélection reste `courriersRecommandes`
 * (filtrage par `declencheurs_noeuds`, inchangé). Il ne fait que PARTITIONNER
 * cette sélection en deux temps et l'ORDONNER. Invariant : tout courrier
 * déclenché ressort dans exactement une des deux listes.
 *
 * Fonction PURE : aucun I/O, aucun React.
 */

import { courriers } from '../data';
import { courriersRecommandes, gestionnaireNode } from './wizard';
import type { Courrier, CourrierId, WizardState } from '../types';

export type MomentCourrier = 'maintenant' | 'plus_tard';

export interface CourrierPlanifie {
  courrier: Courrier;
  moment: MomentCourrier;
  /** Phrase courte et lisible, ex. « Sous 5 jours ouvrés ». */
  quand: string;
  /** Pour « plus_tard » : la condition d'envoi en clair, orientée « si / quand ». */
  declencheur?: string;
}

export interface PlanCourriers {
  maintenant: CourrierPlanifie[];
  plusTard: CourrierPlanifie[];
}

/**
 * Ce qui part LE JOUR de l'ouverture, sans condition d'attente. Règle métier
 * validée par Sekou : sur un DDE classique il envoie C2 (invitation à déclarer
 * + constat) et, quand le parcours désigne l'assureur de l'immeuble, C1
 * (déclaration à cet assureur). Rien d'autre : C5 n'est envoyé que si le statut
 * d'assurance est inconnu, ce que le parcours dit déjà via ses déclencheurs.
 *
 * Point de couplage ASSUMÉ à des ids de courriers (comme `q_tranche` dans
 * `wizard.ts`) : la notion de « jour J » n'est portée par aucun champ de
 * `courriers-types-dde.json`. `delai` ne suffit pas à la dériver ; C6 est lui
 * aussi « immédiat », mais à réception d'une convocation, donc jamais au jour J.
 * L'ordre de ce tableau est l'ordre d'affichage.
 */
const A_L_OUVERTURE: ReadonlyArray<{ id: CourrierId; siGestionnaire?: string }> = [
  { id: 'C2' },
  { id: 'C1', siGestionnaire: 'assureur_immeuble' },
];

/**
 * Reformulation du champ `delai` (et des `declencheurs_conditions`) pour un
 * gestionnaire pressé : pas de jargon, pas de référence d'article - les
 * références restent dans le détail du courrier.
 *
 * On REFORMULE, on ne tranche pas : là où la donnée est floue (C3 « J+15 » après
 * quoi ?, C7 « défaut J+21 », C8 « dès qualification du répétitif »), la phrase
 * reste aussi ouverte que la donnée. Un courrier absent de cette table retombe
 * sur son `delai` brut : ajouter un courrier au JSON ne casse rien.
 */
const REFORMULATIONS: Record<CourrierId, { quand: string; declencheur?: string }> = {
  C1: { quand: 'Sous 5 jours ouvrés' },
  C2: { quand: "Immédiat à l'ouverture" },
  C3: {
    quand: 'Relance à J+15',
    declencheur: "Si la cause n'est pas réparée sous 15 jours",
  },
  C4: {
    quand: 'À réception',
    declencheur: 'Quand tu reçois le rapport et la facture de recherche de fuite',
  },
  C5: {
    quand: 'Sans attendre',
    declencheur: "Si tu ne sais pas si la partie est assurée",
  },
  C6: {
    quand: 'Immédiat',
    declencheur: "Quand tu reçois une convocation à expertise",
  },
  C7: {
    quand: 'Par défaut à J+21',
    declencheur: "Si l'assureur ne prend pas position sous 21 jours",
  },
  C8: {
    quand: 'Dès qualification',
    declencheur: 'Quand le sinistre devient répétitif ou que la cause est commune',
  },
  C9: {
    quand: 'À la décision',
    declencheur: "Quand tu décides d'organiser la recherche de fuite",
  },
};

/** Phrase « quand » d'un courrier ; à défaut de reformulation, le délai brut. */
function quandDe(c: Courrier): string {
  return REFORMULATIONS[c.id]?.quand ?? c.delai;
}

/**
 * Condition d'envoi en clair. À défaut de reformulation, on retombe sur ce que
 * dit la donnée : les `declencheurs_conditions`, sinon le `delai`.
 */
function declencheurDe(c: Courrier): string {
  const reformule = REFORMULATIONS[c.id]?.declencheur;
  if (reformule) return reformule;
  if (c.declencheurs_conditions?.length) return c.declencheurs_conditions.join(' · ');
  return c.delai;
}

/**
 * Partitionne les courriers DÉJÀ recommandés par le parcours en « à faire
 * maintenant » et « plus tard, si ça arrive ».
 *
 * Un courrier non déclenché par le parcours n'apparaît nulle part : c'est le
 * comportement actuel, on ne l'élargit pas.
 */
export function planifierCourriers(wizard: WizardState): PlanCourriers {
  const declenches = courriersRecommandes(wizard);
  const parId = new Map(courriers.map((c) => [c.id, c]));
  const gestionnaire = gestionnaireNode(wizard)?.gestionnaire;

  const maintenant: CourrierPlanifie[] = [];
  const dejaPlaces = new Set<CourrierId>();

  // 1. Le jour J, dans l'ordre déclaré (C2 puis C1).
  for (const regle of A_L_OUVERTURE) {
    if (!declenches.includes(regle.id)) continue;
    if (regle.siGestionnaire && regle.siGestionnaire !== gestionnaire) continue;
    const courrier = parId.get(regle.id);
    if (!courrier) continue;
    maintenant.push({ courrier, moment: 'maintenant', quand: quandDe(courrier) });
    dejaPlaces.add(regle.id);
  }

  // 2. Tout le reste des courriers déclenchés, dans l'ordre du JSON.
  const plusTard: CourrierPlanifie[] = [];
  for (const id of declenches) {
    if (dejaPlaces.has(id)) continue;
    const courrier = parId.get(id);
    if (!courrier) continue;
    plusTard.push({
      courrier,
      moment: 'plus_tard',
      quand: quandDe(courrier),
      declencheur: declencheurDe(courrier),
    });
  }

  return { maintenant, plusTard };
}
