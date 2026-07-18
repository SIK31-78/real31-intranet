/**
 * Accès typé aux données métier. Seul point d'import des JSON dans l'app.
 * Le contenu reste la source de vérité (CLAUDE.md §2) ; ce module ne fait que
 * fournir un typage fort au-dessus du JSON brut.
 */

import arbreJson from './arbre-decision-dde.json';
import courriersJson from './courriers-types-dde.json';
import type { ArbreDecision, CourriersData } from '../types';

export const arbre = arbreJson as unknown as ArbreDecision;
export const courriersData = courriersJson as unknown as CourriersData;

export const nodes = arbre.nodes;
export const lexique = arbre.lexique;
export const parametres = arbre.meta.parametres;
export const noeudInitial = arbre.meta.noeud_initial;
export const courriers = courriersData.courriers;
