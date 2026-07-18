/**
 * Types des courriers types (src/data/courriers-types-dde.json).
 *
 * Le code ne connaît que la SYNTAXE des gabarits ({{champ}} et
 * {{#si condition}}…{{/si}}). Ajouter un courrier ne nécessite aucune
 * modification de code.
 */

import type { NodeId } from './arbre';

export type CourrierId = string;

export interface Courrier {
  id: CourrierId;
  titre: string;
  destinataire: string;
  mode_envoi: string;
  delai: string;
  /** Nœuds de l'arbre dont la traversée recommande ce courrier. */
  declencheurs_noeuds: NodeId[];
  declencheurs_conditions?: string[];
  pieces_obligatoires?: string[];
  /** Champs `{{champ}}` attendus dans le gabarit. */
  champs: string[];
  /** Conditions des blocs `{{#si …}}` documentées. */
  blocs_conditionnels?: string[];
  references?: string[];
  gabarit: string;
}

export interface CourriersMeta {
  titre: string;
  version: string;
  lie_a: string;
  syntaxe_fusion: string;
  regle_generation: string;
}

/** Modèle de données : groupe -> liste de champs documentés. */
export type ModeleDonnees = Record<string, string[]>;

export interface CourriersData {
  meta: CourriersMeta;
  modele_donnees: ModeleDonnees;
  courriers: Courrier[];
}
