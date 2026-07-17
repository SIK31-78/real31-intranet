/**
 * Agregat metier du dossier sinistre (JSON-serialisable, sans dependance UI).
 *
 * Extrait du store client (`state/store.tsx`) pour que le DOMAINE PUR et les
 * adapters serveur (port `SinistreRepository`) puissent en dependre sans tirer
 * un fichier `'use client'`. Le store ne fait plus que re-exporter ces types et
 * les utiliser dans son reducer.
 */

import type {
  AssureurImmeuble,
  AssureurRef,
  ImmeubleInfo,
  LocalSinistre,
  MesureEtat,
  NodeId,
  Partie,
  RendezVousExpertise,
  RolePartie,
  StatutDossier,
} from './index';

export interface DossierState {
  /** Id Supabase du sinistre (uuid). Absent tant que le dossier n'a jamais ete persiste. */
  id?: string;
  /**
   * Id du DOSSIER de l'intranet (module Dossiers) auquel ce sinistre est rattache.
   * C'est ce qui rend le sinistre visible dans « Mes dossiers » : sans lui, le sinistre
   * n'existe que dans `intranet_sinistres` et n'apparait nulle part.
   * Pose soit par `?dossier=<id>` (wizard ouvert DEPUIS un dossier existant), soit par
   * le premier enregistrement (qui cree alors le dossier). Presence = deja rattache :
   * on ne cree jamais un second dossier pour le meme sinistre.
   */
  dossierId?: string;
  referenceInterne: string;
  date: string;
  immeuble: ImmeubleInfo;
  /**
   * Id de la copropriete dans le referentiel cabinet (public."Copropriete", PK text),
   * choisie via le selecteur d'immeuble (mode supabase). `immeuble` (nom/adresse) en
   * reste la projection lisible. Absent en mode localstorage tant que le selecteur
   * n'est pas branche (etape 5).
   */
  coproprieteId?: string;
  /** Agence derivee de la copropriete selectionnee (D2) - posee par le selecteur, lue au save. */
  agenceId?: string;
  /**
   * Gestionnaire-signataire du dossier (identite de l'utilisateur courant). Pose par
   * le selecteur d'immeuble / le pre-remplissage depuis un dossier ; alimente la fusion
   * des courriers (`gestionnaire.nom` / `gestionnaire.email`). Absent tant que le
   * contexte n'a pas ete charge.
   */
  gestionnaire?: { nom: string; email: string; initiales: string };
  descriptif: string;
  /** Statut du dossier (defaut `'brouillon'`). Persiste ; sert plus tard a la frontiere requalification. */
  statut: StatutDossier;
  assureurImmeuble?: AssureurImmeuble;
  locaux: LocalSinistre[];
  activeLocalId: string;
}

/** Action du reducer du dossier (state/store.tsx). Sans dependance UI. */
export type Action =
  | { type: 'NOUVEAU' }
  | { type: 'CHARGER'; state: DossierState }
  | { type: 'META'; patch: Partial<Pick<DossierState, 'date' | 'descriptif'>> }
  | { type: 'IMMEUBLE'; patch: Partial<ImmeubleInfo> }
  | { type: 'ANSWER'; optionIndex: number }
  | { type: 'ADVANCE' }
  | { type: 'BACK' }
  | { type: 'MODIFIER_REPONSE'; nodeId: NodeId }
  | { type: 'AJOUTER_LOCAL' }
  | { type: 'AJOUTER_LOCAL_COMMUNS' }
  | { type: 'SUPPRIMER_LOCAL'; id: string }
  | { type: 'ACTIVER_LOCAL'; id: string }
  | { type: 'LIBELLE_LOCAL'; id: string; libelle: string }
  | { type: 'LIBELLE_ACTIF'; libelle: string }
  | { type: 'SET_PARTIE'; role: RolePartie; patch: Partial<Partie> }
  | { type: 'SET_PARTIE_ASSUREUR'; role: RolePartie; patch: Partial<AssureurRef> }
  | { type: 'SET_ASSUREUR_IMMEUBLE'; patch: Partial<AssureurImmeuble> }
  | { type: 'SET_MESURE'; key: string; etat: MesureEtat | null }
  | { type: 'SET_POINT_VIGILANCE'; id: string; valeur: boolean }
  | { type: 'AJOUTER_RDV' }
  | { type: 'MAJ_RDV'; id: string; patch: Partial<RendezVousExpertise> }
  | { type: 'SUPPRIMER_RDV'; id: string }
  | {
      type: 'PERSISTE_OK';
      id: string;
      referenceInterne: string;
      /** Dossier cree (ou deja rattache) par l'enregistrement serveur. */
      dossierId?: string;
    }
  | {
      type: 'SELECTIONNER_COPROPRIETE';
      coproprieteId: string;
      agenceId?: string;
      nom: string;
      adresse: string;
      assureurNom: string;
      assureurPolice: string;
      /** Signataire courant (alimente la fusion des courriers). Facultatif. */
      gestionnaire?: { nom: string; email: string; initiales: string };
      /** Dossier d'origine quand le wizard est ouvert via `?dossier=<id>`. */
      dossierId?: string;
    };
