// Domaine du dashboard comptable (pole compta transverse, demande patron 2026-07).
// Quand une date d'AG est posee puis CONFIRMEE par le conseil syndical, le comptable
// doit le voir et suivre la preparation des comptes. Ce module compose des LIGNES (une
// par AG a venir) puis les GROUPE : confirmees (signal d'action) vs a confirmer
// (visibilite anticipee). Types + fonctions PURS (ADR-001), zero I/O.

import type { StatutConfirmation } from "@/lib/domain/confirmation-evenement";

/** Une AG a venir vue par le pole comptable (copro + date + confirmation + etat compta). */
export interface LigneComptable {
  coproCode: string;
  coproNom: string;
  /** Nom du gestionnaire de la copro (equipe, role gestionnaire) ; absent si non resolu. */
  gestionnaireNom?: string;
  /** Date d'AG a venir (ISO "YYYY-MM-DD"). */
  agDate: string;
  /** Heure de reunion "HH:mm" si connue. */
  agHeure?: string;
  /** Statut de confirmation de la date par le conseil syndical. */
  statutConfirmation: StatutConfirmation;
  /** La comptable a marque les comptes verifies. */
  comptesVerifies: boolean;
  /** Le CS demande les comptes AVANT la reunion. */
  envoyerAvant: boolean;
  /** Nb de notes non resolues (fil gestionnaire <-> comptable). */
  notesOuvertes: number;
}

/** Dashboard comptable : les AG a venir reparties par statut de confirmation. */
export interface DashboardComptable {
  /** Date CONFIRMEE par le CS : la date est sure, il faut preparer les comptes (action). */
  confirmees: LigneComptable[];
  /** Date encore a confirmer : visibilite anticipee, pas encore un ordre de marche. */
  aConfirmer: LigneComptable[];
}

/** Criteres de filtrage du dashboard (facultatifs). */
export interface FiltreComptable {
  /** Nom exact d'un gestionnaire, ou undefined = tous. */
  gestionnaire?: string;
  /** Mois d'AG "YYYY-MM", ou undefined = tous. */
  mois?: string;
}

/** Tri stable : par date d'AG croissante, puis par code copro (departage deterministe). */
function parDate(a: LigneComptable, b: LigneComptable): number {
  return a.agDate.localeCompare(b.agDate) || a.coproCode.localeCompare(b.coproCode);
}

/**
 * Ne garde que les AG A VENIR (date >= today) et les repartit confirmees / a confirmer,
 * chaque groupe trie par date croissante (la plus proche en premier).
 */
export function composerDashboardComptable(
  lignes: LigneComptable[],
  today: string,
): DashboardComptable {
  const avenir = lignes.filter((l) => l.agDate >= today);
  return {
    confirmees: avenir.filter((l) => l.statutConfirmation === "confirme").sort(parDate),
    aConfirmer: avenir.filter((l) => l.statutConfirmation !== "confirme").sort(parDate),
  };
}

/** Filtre les lignes par gestionnaire et/ou mois d'AG (pur). */
export function filtrerComptable(
  lignes: LigneComptable[],
  filtre: FiltreComptable,
): LigneComptable[] {
  return lignes.filter((l) => {
    if (filtre.gestionnaire && l.gestionnaireNom !== filtre.gestionnaire) return false;
    if (filtre.mois && l.agDate.slice(0, 7) !== filtre.mois) return false;
    return true;
  });
}

/** Noms de gestionnaires distincts presents (options du filtre), tries alphabetiquement. */
export function gestionnairesDistincts(lignes: LigneComptable[]): string[] {
  const noms = lignes.map((l) => l.gestionnaireNom).filter((n): n is string => Boolean(n));
  return [...new Set(noms)].sort((a, b) => a.localeCompare(b));
}

/** Mois d'AG distincts presents "YYYY-MM" (options du filtre), tries croissant. */
export function moisDistincts(lignes: LigneComptable[]): string[] {
  return [...new Set(lignes.map((l) => l.agDate.slice(0, 7)))].sort();
}
