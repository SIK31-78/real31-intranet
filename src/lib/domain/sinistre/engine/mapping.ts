/**
 * Table de correspondance UNIQUE entre les clés de champ des courriers
 * (`modele_donnees`) et les chemins de la `FicheSinistre`.
 *
 * C'est de la PLOMBERIE (pas une règle métier) : autorisée en code, mais
 * centralisée dans ce seul fichier et testée. Sens direct (pré-remplissage) et
 * sens inverse (la saisie dans le générateur alimente en retour le dossier).
 *
 * Une clé sans correspondance reste vide - surlignée et bloquante à l'export.
 */

import { gestionnaireNode } from './wizard';
import { CABINET } from '../data/cabinet';
import type { AssureurImmeuble, AssureurRef, LocalSinistre, RolePartie } from '../types';
import type { DossierState } from '../state/store';

export interface MappingContext {
  state: DossierState;
  local: LocalSinistre;
}

type AssureurCible = { kind: 'partie'; role: RolePartie } | { kind: 'assureurImmeuble' };

/** Désigne, selon le parcours, à quel assureur correspond « le gestionnaire ». */
function cibleGestionnaire(ctx: MappingContext): AssureurCible | undefined {
  switch (gestionnaireNode(ctx.local.wizard)?.gestionnaire) {
    case 'assureur_coproprietaire_occupant':
      return { kind: 'partie', role: 'coproprietaire' };
    case 'assureur_occupant':
      return { kind: 'partie', role: 'occupant' };
    case 'assureur_cno':
      return { kind: 'partie', role: 'coproprietaire' };
    case 'assureur_immeuble':
      return { kind: 'assureurImmeuble' };
    default:
      return undefined;
  }
}

function assureurDe(
  ctx: MappingContext,
  cible: AssureurCible | undefined,
): AssureurRef | AssureurImmeuble | undefined {
  if (!cible) return undefined;
  return cible.kind === 'assureurImmeuble'
    ? ctx.state.assureurImmeuble
    : ctx.local.parties?.[cible.role]?.assureur;
}

// --- Sens direct : clé de champ -> valeur du dossier ----------------------

const DIRECT: Record<string, (ctx: MappingContext) => string | undefined> = {
  'sinistre.date': (c) => c.state.date,
  'sinistre.reference_interne': (c) => c.state.referenceInterne,
  'sinistre.description': (c) => c.state.descriptif,
  'sinistre.locaux_touches': (c) => c.state.locaux.map((l) => l.libelle).join(', '),
  'immeuble.nom': (c) => c.state.immeuble.nom,
  'immeuble.adresse': (c) => c.state.immeuble.adresse,
  // Cabinet (en-tête courrier) : constantes centralisées (data/cabinet.ts).
  'syndic.nom': () => CABINET.nom,
  'syndic.adresse': () => CABINET.adresse,
  'syndic.email': () => CABINET.email,
  'syndic.telephone': () => CABINET.telephone,
  // Gestionnaire-signataire : identité de l'utilisateur courant, posée sur le dossier
  // par le pré-remplissage (SELECTIONNER_COPROPRIETE) ; plus de saisie manuelle.
  'gestionnaire.nom': (c) => c.state.gestionnaire?.nom,
  'gestionnaire.email': (c) => c.state.gestionnaire?.email,
  'lot.numero': (c) => c.local.libelle,
  'partie.coproprietaire.nom': (c) => c.local.parties?.coproprietaire?.nom,
  'assureur_immeuble.numero_police': (c) => c.state.assureurImmeuble?.numeroPolice,
  'assureur_partie.numero_police': (c) => c.local.parties?.coproprietaire?.assureur?.numeroPolice,
  'assureur.numero_sinistre': (c) => assureurDe(c, cibleGestionnaire(c))?.numeroSinistre,
  // Désignation lisible du gestionnaire, extraite du titre du nœud r_gest_*
  // (« … : assureur du (co)propriétaire occupant » - « du (co)propriétaire occupant »).
  'assureur_gestionnaire': (c) => {
    const titre = gestionnaireNode(c.local.wizard)?.titre;
    return titre?.match(/:\s*assureur\s+(.+)$/i)?.[1];
  },
};

/** Liste des clés couvertes par la table (utile aux tests / introspection). */
export const CLES_MAPPEES = Object.keys(DIRECT);

/** Valeur pré-remplie pour une clé de champ, ou `undefined` si non mappée. */
export function resoudreChamp(key: string, ctx: MappingContext): string | undefined {
  const resolver = DIRECT[key];
  return resolver ? resolver(ctx) : undefined;
}

// --- Sens inverse : écriture dans le dossier ------------------------------

export type Ecriture =
  // T1 : referenceInterne n'est plus modifiable (référence serveur, lecture seule).
  | { cible: 'meta'; champ: 'date' | 'descriptif'; valeur: string }
  | { cible: 'immeuble'; champ: 'nom' | 'adresse'; valeur: string }
  | { cible: 'libelle'; valeur: string }
  | { cible: 'assureurImmeuble'; champ: keyof AssureurImmeuble; valeur: string }
  | { cible: 'partie'; role: RolePartie; champ: 'nom' | 'email'; valeur: string }
  | { cible: 'partieAssureur'; role: RolePartie; champ: keyof AssureurRef; valeur: string };

/** Écriture à appliquer au dossier pour une clé éditée dans le générateur. */
export function inverse(key: string, valeur: string, ctx: MappingContext): Ecriture | undefined {
  switch (key) {
    case 'sinistre.date':
      return { cible: 'meta', champ: 'date', valeur };
    // 'sinistre.reference_interne' : pas de sens inverse (T1, lecture seule).
    case 'sinistre.description':
      return { cible: 'meta', champ: 'descriptif', valeur };
    case 'immeuble.nom':
      return { cible: 'immeuble', champ: 'nom', valeur };
    case 'immeuble.adresse':
      return { cible: 'immeuble', champ: 'adresse', valeur };
    case 'lot.numero':
      return { cible: 'libelle', valeur };
    case 'partie.coproprietaire.nom':
      return { cible: 'partie', role: 'coproprietaire', champ: 'nom', valeur };
    case 'assureur_immeuble.numero_police':
      return { cible: 'assureurImmeuble', champ: 'numeroPolice', valeur };
    case 'assureur_partie.numero_police':
      return { cible: 'partieAssureur', role: 'coproprietaire', champ: 'numeroPolice', valeur };
    case 'assureur.numero_sinistre': {
      const cible = cibleGestionnaire(ctx);
      if (!cible) return undefined;
      return cible.kind === 'assureurImmeuble'
        ? { cible: 'assureurImmeuble', champ: 'numeroSinistre', valeur }
        : { cible: 'partieAssureur', role: cible.role, champ: 'numeroSinistre', valeur };
    }
    default:
      return undefined;
  }
}
