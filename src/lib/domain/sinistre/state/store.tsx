/**
 * Store du dossier en cours (CLAUDE.md §5).
 *
 * État in-memory + sauvegarde de brouillon en localStorage (clé versionnée
 * `sinistre-draft-v3`). Multi-locaux : la phase 1 est commune, dupliquée à
 * chaque ajout de local (RÈGLE MULTI-LOCAUX). Capture facultative des parties
 * et assureurs (non bloquante).
 *
 * INCRÉMENT 1 (read-only, portage intranet) : la persistance Supabase
 * (`enregistrer`) est retirée ; le brouillon localStorage reste, rendu SSR-safe.
 */

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  advance,
  answer,
  back,
  getNode,
  initialState,
  revenirA,
  settleBackward,
  settleForward,
} from '../engine/wizard';
import { communePrefix } from '../engine/phases';
import { cibleCapture, deduireStatut } from './capture';
import { genererReference } from '../util/reference';
import { nodes } from '../data';
import type {
  AssureurImmeuble,
  AssureurRef,
  LocalSinistre,
  NodeId,
  Partie,
  RolePartie,
  WizardState,
} from '../types';
// DossierState + Action vivent desormais dans le domaine pur (types/), pour qu'un
// adapter serveur puisse en dependre sans tirer ce fichier 'use client'.
import type { Action, DossierState } from '../types';
import type { Ecriture } from '../engine/mapping';

export type { DossierState } from '../types';

const DRAFT_KEY = 'sinistre-draft-v3';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nouveauDossier(): DossierState {
  const id = newId();
  return {
    referenceInterne: genererReference(),
    date: '',
    immeuble: { nom: '', adresse: '' },
    descriptif: '',
    statut: 'brouillon',
    locaux: [{ id, libelle: '', wizard: initialState() }],
    activeLocalId: id,
  };
}

function localActif(state: DossierState): LocalSinistre | undefined {
  return state.locaux.find((l) => l.id === state.activeLocalId);
}

function setActiveLocal(
  state: DossierState,
  fn: (l: LocalSinistre) => LocalSinistre,
): DossierState {
  return {
    ...state,
    locaux: state.locaux.map((l) => (l.id === state.activeLocalId ? fn(l) : l)),
  };
}

function mapActiveWizard(
  state: DossierState,
  fn: (w: WizardState) => WizardState,
): DossierState {
  return setActiveLocal(state, (l) => ({ ...l, wizard: fn(l.wizard) }));
}

const PARTIE_VIDE: Partie = { nom: '', statutAssurance: 'inconnu' };

function majPartie(local: LocalSinistre, role: RolePartie, patch: Partial<Partie>): LocalSinistre {
  const parties = local.parties ?? {};
  const courante = parties[role] ?? PARTIE_VIDE;
  return { ...local, parties: { ...parties, [role]: { ...courante, ...patch } } };
}

function majPartieAssureur(
  local: LocalSinistre,
  role: RolePartie,
  patch: Partial<AssureurRef>,
): LocalSinistre {
  const parties = local.parties ?? {};
  const courante = parties[role] ?? PARTIE_VIDE;
  const assureur: AssureurRef = { nom: '', ...courante.assureur, ...patch };
  return { ...local, parties: { ...parties, [role]: { ...courante, assureur } } };
}

/**
 * Retire un local du dossier (E-1). Interdit de supprimer le dernier : un
 * sinistre comporte toujours au moins un local. Si le local actif est supprimé,
 * la sélection bascule sur le premier local restant.
 */
export function supprimerLocal(state: DossierState, id: string): DossierState {
  if (state.locaux.length <= 1) return state;
  const restants = state.locaux.filter((l) => l.id !== id);
  if (restants.length === state.locaux.length) return state; // id introuvable
  const activeLocalId =
    state.activeLocalId === id ? restants[0]!.id : state.activeLocalId;
  return { ...state, locaux: restants, activeLocalId };
}

function reducer(state: DossierState, action: Action): DossierState {
  switch (action.type) {
    case 'NOUVEAU':
      return nouveauDossier();
    case 'CHARGER':
      return action.state;
    case 'META':
      return { ...state, ...action.patch };
    case 'IMMEUBLE':
      return { ...state, immeuble: { ...state.immeuble, ...action.patch } };
    case 'ANSWER': {
      const noeud = localActif(state)?.wizard.current;
      let next = mapActiveWizard(state, (w) => settleForward(answer(w, w.current, action.optionIndex)));
      // statutAssurance déduit de l'option choisie (capture non bloquante).
      if (noeud) {
        const statut = deduireStatut(noeud, action.optionIndex);
        const cible = cibleCapture(noeud);
        if (statut && cible?.kind === 'partie') {
          next = setActiveLocal(next, (l) => majPartie(l, cible.role, { statutAssurance: statut }));
        }
      }
      return next;
    }
    case 'ADVANCE':
      return mapActiveWizard(state, (w) => settleForward(advance(w)));
    case 'BACK':
      return mapActiveWizard(state, (w) => settleBackward(back(w)));
    case 'MODIFIER_REPONSE':
      return mapActiveWizard(state, (w) => revenirA(w, action.nodeId));
    case 'AJOUTER_LOCAL': {
      const active = state.locaux.find((l) => l.id === state.activeLocalId);
      if (!active) return state;
      const { prefix, branchNode } = communePrefix(active.wizard);
      if (!branchNode) return state; // pas encore de point de bascule par local
      const id = newId();
      // G-4 : nom vide à la création (le collaborateur doit le renseigner).
      const local: LocalSinistre = { id, libelle: '', wizard: prefix };
      return { ...state, locaux: [...state.locaux, local], activeLocalId: id };
    }
    case 'AJOUTER_LOCAL_COMMUNS': {
      // G-5 : crée un local pré-qualifié « parties communes » (- assureur immeuble).
      const active = localActif(state);
      if (!active) return state;
      const { prefix, branchNode } = communePrefix(active.wizard);
      if (!branchNode) return state;
      const node = getNode(branchNode);
      if (node.type !== 'question') return state;
      const idx = node.options.findIndex((o) => o.suivant === 'r_gest_immeuble_communs');
      if (idx < 0) return state;
      const wizard = settleForward(answer(prefix, branchNode, idx));
      const id = newId();
      const local: LocalSinistre = { id, libelle: 'Parties communes', wizard };
      return { ...state, locaux: [...state.locaux, local], activeLocalId: id };
    }
    case 'SUPPRIMER_LOCAL':
      return supprimerLocal(state, action.id);
    case 'ACTIVER_LOCAL':
      return state.locaux.some((l) => l.id === action.id)
        ? { ...state, activeLocalId: action.id }
        : state;
    case 'LIBELLE_LOCAL':
      return {
        ...state,
        locaux: state.locaux.map((l) =>
          l.id === action.id ? { ...l, libelle: action.libelle } : l,
        ),
      };
    case 'LIBELLE_ACTIF':
      return setActiveLocal(state, (l) => ({ ...l, libelle: action.libelle }));
    case 'SET_PARTIE':
      return setActiveLocal(state, (l) => majPartie(l, action.role, action.patch));
    case 'SET_PARTIE_ASSUREUR':
      return setActiveLocal(state, (l) => majPartieAssureur(l, action.role, action.patch));
    case 'SET_ASSUREUR_IMMEUBLE': {
      const courant: AssureurImmeuble = state.assureurImmeuble ?? { nom: '', numeroPolice: '' };
      return { ...state, assureurImmeuble: { ...courant, ...action.patch } };
    }
    case 'SET_MESURE':
      return setActiveLocal(state, (l) => {
        const mesures = { ...(l.mesures ?? {}) };
        if (action.etat === null) delete mesures[action.key];
        else mesures[action.key] = action.etat;
        return { ...l, mesures };
      });
    case 'SET_POINT_VIGILANCE':
      return setActiveLocal(state, (l) => ({
        ...l,
        pointsVigilance: { ...(l.pointsVigilance ?? {}), [action.id]: action.valeur },
      }));
    case 'AJOUTER_RDV':
      return setActiveLocal(state, (l) => ({
        ...l,
        rendezVousExpertise: [
          ...(l.rendezVousExpertise ?? []),
          { id: newId(), date: '', convoquePar: 'assureur_immeuble', facture: false },
        ],
      }));
    case 'MAJ_RDV':
      return setActiveLocal(state, (l) => ({
        ...l,
        rendezVousExpertise: (l.rendezVousExpertise ?? []).map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r,
        ),
      }));
    case 'SUPPRIMER_RDV':
      return setActiveLocal(state, (l) => ({
        ...l,
        rendezVousExpertise: (l.rendezVousExpertise ?? []).filter((r) => r.id !== action.id),
      }));
    case 'PERSISTE_OK':
      // Id + référence assignés par le serveur après enregistrement (mode supabase).
      // `dossierId` : rattachement au module Dossiers (créé au 1er enregistrement).
      // Non destructif : on ne l'efface jamais si le serveur ne le renvoie pas.
      return {
        ...state,
        id: action.id,
        referenceInterne: action.referenceInterne,
        ...(action.dossierId ? { dossierId: action.dossierId } : {}),
      };
    case 'SELECTIONNER_COPROPRIETE': {
      // Sélecteur d'immeuble (mode supabase) : copropriété + agence dérivée + signataire +
      // nom/adresse/assurance (nom/police LUS de la copro, D5 ; numeroSinistre conservé).
      // Non destructif : une assurance déjà saisie n'est pas écrasée par un champ vide
      // (le pré-remplissage depuis un dossier ne connaît pas l'assureur).
      const courant = state.assureurImmeuble;
      const assureurImmeuble: AssureurImmeuble = {
        nom: action.assureurNom || courant?.nom || '',
        numeroPolice: action.assureurPolice || courant?.numeroPolice || '',
      };
      const numeroSinistre = courant?.numeroSinistre;
      if (numeroSinistre) assureurImmeuble.numeroSinistre = numeroSinistre;
      return {
        ...state,
        coproprieteId: action.coproprieteId,
        agenceId: action.agenceId,
        ...(action.gestionnaire ? { gestionnaire: action.gestionnaire } : {}),
        // Rattachement au dossier d'origine (?dossier=<id>) : empêche l'enregistrement
        // de créer un SECOND dossier pour un sinistre déjà rattaché.
        ...(action.dossierId ? { dossierId: action.dossierId } : {}),
        immeuble: { nom: action.nom, adresse: action.adresse },
        assureurImmeuble,
      };
    }
    default:
      return state;
  }
}

/** Applique au dossier une écriture issue du générateur (sens inverse du mapping). */
export function appliquerEcriture(dispatch: Dispatch<Action>, e: Ecriture): void {
  switch (e.cible) {
    case 'meta':
      dispatch({ type: 'META', patch: { [e.champ]: e.valeur } });
      break;
    case 'immeuble':
      dispatch({ type: 'IMMEUBLE', patch: { [e.champ]: e.valeur } });
      break;
    case 'libelle':
      dispatch({ type: 'LIBELLE_ACTIF', libelle: e.valeur });
      break;
    case 'assureurImmeuble':
      dispatch({ type: 'SET_ASSUREUR_IMMEUBLE', patch: { [e.champ]: e.valeur } });
      break;
    case 'partie':
      dispatch({ type: 'SET_PARTIE', role: e.role, patch: { [e.champ]: e.valeur } });
      break;
    case 'partieAssureur':
      dispatch({ type: 'SET_PARTIE_ASSUREUR', role: e.role, patch: { [e.champ]: e.valeur } });
      break;
  }
}

/**
 * Un brouillon est « entamé » dès qu'on y a saisi quelque chose : une réponse au
 * parcours, un local nommé, un 2e local, ou un champ d'en-tête rempli. Sert à ne
 * demander confirmation d'écrasement (« Nouveau sinistre ») que s'il y a vraiment
 * à perdre - un parcours vierge se remplace sans friction.
 */
export function brouillonEntame(state: DossierState): boolean {
  if (state.locaux.length > 1) return true;
  if (state.date || state.descriptif || state.immeuble.nom || state.immeuble.adresse) return true;
  return state.locaux.some((l) => l.libelle.trim() !== '' || l.wizard.steps.length > 0);
}

/** Vérifie qu'un brouillon chargé reste cohérent avec les données actuelles. */
function draftValide(state: DossierState): boolean {
  if (!state.locaux?.length || !state.activeLocalId) return false;
  return state.locaux.every((l) => {
    if (!l.wizard || !(l.wizard.current in nodes)) return false;
    return l.wizard.steps.every((s) => (s.nodeId as NodeId) in nodes);
  });
}

function chargerBrouillon(): DossierState | null {
  if (typeof window === 'undefined') return null; // SSR : pas de localStorage
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DossierState;
    if (!draftValide(parsed)) return null;
    // Brouillon antérieur sans `statut` - défaut brouillon (compat ascendante).
    return { ...parsed, statut: parsed.statut ?? 'brouillon' };
  } catch {
    return null;
  }
}

// Seed DETERMINISTE, identique au SSR et au premier rendu client : aucune valeur
// aleatoire (reference, ids) ici, sinon le HTML serveur differe du HTML client et
// l'hydratation echoue. La vraie reference / le brouillon sont charges apres montage
// (useEffect, cote client uniquement). Le placeholder se reconnait a referenceInterne ''.
function etatInitialDeterministe(): DossierState {
  return {
    referenceInterne: '',
    date: '',
    immeuble: { nom: '', adresse: '' },
    descriptif: '',
    statut: 'brouillon',
    locaux: [{ id: 'loc-initial', libelle: '', wizard: initialState() }],
    activeLocalId: 'loc-initial',
  };
}

interface DossierContextValue {
  state: DossierState;
  dispatch: React.Dispatch<Action>;
}

const DossierContext = createContext<DossierContextValue | null>(null);

export function DossierProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, etatInitialDeterministe);
  const initialise = useRef(false);

  // Initialisation client-only (apres hydratation) : on charge le brouillon
  // localStorage, ou on cree un nouveau dossier (reference/ids aleatoires generes
  // ICI, jamais au rendu serveur). Garde anti-double-exec (StrictMode).
  useEffect(() => {
    if (initialise.current) return;
    initialise.current = true;
    dispatch({ type: 'CHARGER', state: chargerBrouillon() ?? nouveauDossier() });
  }, []);

  // Auto-save localStorage (read-only : plus de bascule persistenceMode). On
  // n'ecrit jamais le placeholder (referenceInterne vide) pour ne pas ecraser un
  // brouillon existant avant son chargement.
  useEffect(() => {
    if (!state.referenceInterne) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch {
      /* quota / mode prive : on ignore, l'etat in-memory reste la source */
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <DossierContext.Provider value={value}>{children}</DossierContext.Provider>;
}

export function useDossier(): DossierContextValue {
  const ctx = useContext(DossierContext);
  if (!ctx) throw new Error('useDossier doit être utilisé dans un DossierProvider');
  return ctx;
}

/** Local actuellement édité. */
export function useActiveLocal(): LocalSinistre {
  const { state } = useDossier();
  const local = state.locaux.find((l) => l.id === state.activeLocalId);
  if (!local) throw new Error('Local actif introuvable');
  return local;
}

export function purgerBrouillon(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export { getNode };
