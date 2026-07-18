// Service du dashboard comptable (pole compta transverse). Compose TOUTES les copros
// (referentiel) + confirmations des dates (conseil syndical) + etat compta (flags / notes)
// en LIGNES, puis groupe/filtre via le domaine pur. Passe par le ROUTEUR uniquement
// (ADR-001), jamais un adapter en direct.
//
// Perf : les deux lectures d'etat sont BATCH (getPourCopros, getEtats) -> pas de N+1.
// Degrade proprement si une table native n'existe pas encore : etat vide, pas de crash.

import type {
  DashboardComptable,
  FiltreComptable,
  LigneComptable,
} from "@/lib/domain/comptabilite";
import {
  composerDashboardComptable,
  filtrerComptable,
  gestionnairesDistincts,
  moisDistincts,
} from "@/lib/domain/comptabilite";
import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import { statutPourDate } from "@/lib/domain/confirmation-evenement";
import type { EtatCompta } from "@/lib/domain/compta";
import {
  getComptaRepository,
  getConfirmationEvenementRepository,
  getCoproRepository,
} from "@/lib/adapters/router";

const ETAT_VIDE: EtatCompta = { comptesVerifies: false, envoyerAvant: false, notes: [] };

/** Toutes les lignes comptables : une par AG A VENIR (date >= today) de TOUTES les copros. */
export async function listerLignesComptables(today: string): Promise<LigneComptable[]> {
  const copros = await getCoproRepository().listerToutes();
  const avecAg = copros.filter((c) => c.prochaineAg?.date && c.prochaineAg.date >= today);
  if (avecAg.length === 0) return [];

  const codes = avecAg.map((c) => c.code);
  // Lectures BATCH (pas de N+1) : confirmations et etats compta d'un seul coup. Chacune
  // degrade en vide si sa table native n'est pas encore deployee.
  const [confirmations, etats] = await Promise.all([
    getConfirmationEvenementRepository()
      .getPourCopros(codes)
      .catch((): ConfirmationEvenement[] => []),
    getComptaRepository()
      .getEtats(avecAg.map((c) => ({ coproCode: c.code, agDateISO: c.prochaineAg!.date })))
      .catch((): Map<string, EtatCompta> => new Map()),
  ]);

  // Confirmation de type AG par copro (le CS confirme une date d'AG precise).
  const confAgParCopro = new Map<string, ConfirmationEvenement>();
  for (const c of confirmations) {
    if (c.type === "AG") confAgParCopro.set(c.coproCode, c);
  }

  return avecAg.map((c) => {
    const date = c.prochaineAg!.date;
    const etat = etats.get(`${c.code}|${date}`) ?? ETAT_VIDE;
    const gestionnaire = c.equipe.find((m) => m.role === "gestionnaire");
    return {
      coproCode: c.code,
      coproNom: c.nom,
      ...(gestionnaire ? { gestionnaireNom: gestionnaire.nomComplet } : {}),
      agDate: date,
      ...(c.prochaineAg!.heure ? { agHeure: c.prochaineAg!.heure } : {}),
      // Une date posee est provisoire tant que le CS ne l'a pas validee (statutPourDate
      // invalide aussi une confirmation portant sur une date replanifiee depuis).
      statutConfirmation: statutPourDate(confAgParCopro.get(c.code) ?? null, date),
      comptesVerifies: etat.comptesVerifies,
      envoyerAvant: etat.envoyerAvant,
      notesOuvertes: etat.notes.filter((n) => !n.resolu).length,
    };
  });
}

export interface DashboardComptableResultat {
  dashboard: DashboardComptable;
  /** Options du filtre gestionnaire (tous les gestionnaires presents, avant filtrage). */
  gestionnaires: string[];
  /** Options du filtre mois "YYYY-MM" (tous les mois presents, avant filtrage). */
  mois: string[];
  /** Nb de lignes apres filtrage (confirmees + a confirmer). */
  total: number;
}

/**
 * Dashboard comptable compose : AG a venir groupees confirmees / a confirmer, filtre
 * applique. Les options de filtre sont calculees sur l'ENSEMBLE a venir (pas seulement
 * le sous-ensemble filtre) pour que le formulaire reste utilisable.
 */
export async function getDashboardComptable(
  today: string,
  filtre: FiltreComptable = {},
): Promise<DashboardComptableResultat> {
  try {
    const toutes = await listerLignesComptables(today);
    const filtrees = filtrerComptable(toutes, filtre);
    return {
      dashboard: composerDashboardComptable(filtrees, today),
      gestionnaires: gestionnairesDistincts(toutes),
      mois: moisDistincts(toutes),
      total: filtrees.length,
    };
  } catch (err) {
    console.warn("[comptabilite] dashboard indisponible :", (err as Error).message);
    return { dashboard: { confirmees: [], aConfirmer: [] }, gestionnaires: [], mois: [], total: 0 };
  }
}
