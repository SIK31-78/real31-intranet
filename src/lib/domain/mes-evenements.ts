// Domaine de l'ecran "Mes evenements" : vue agregee cross-copros du gestionnaire.
// Types metier purs (ADR-001). C'est une vue de pilotage (comme le Dashboard) :
// trois listes derivees des jalons / evenements / referentiel copro.

import type { Severite } from "@/lib/domain/commun";

/** Ton du badge d'urgence : rouge (aujourd'hui/retard), ambre (proche), neutre. */
export type UrgenceTon = "err" | "warn" | "neutral";

export interface BadgeUrgence {
  texte: string;
  ton: UrgenceTon;
}

/** Une action a traiter (section "A traiter en priorite"). */
export interface ActionATraiter {
  id: string;
  titre: string;
  badge: BadgeUrgence;
  /** Contexte copro + echeance, ex "S104 · Les Marronniers · AG du 28 mai · J-21". */
  contexte: string;
  /** Severite du marqueur a gauche de la ligne. */
  severite: Severite;
  /** Lien de traitement (supervision ou fiche copro). */
  lien?: string;
}

/** Une AG a venir avec sa progression de jalons (section "Mes AG a venir"). */
export interface AgAVenir {
  id: string;
  coproCode: string;
  coproNom: string;
  /** Date ISO "YYYY-MM-DD". */
  date: string;
  heure?: string;
  badge: BadgeUrgence;
  jalonsFaits: number;
  jalonsTotal: number;
  /** Prochain jalon a accomplir, ex "envoyer convocations (aujourd'hui)". */
  prochainJalon: string;
  prochainJalonSeverite: Severite;
  lien?: string;
}

/** Une copro sans AG planifiee (section "Mes copros sans AG planifiee"). */
export interface CoproSansAg {
  coproCode: string;
  coproNom: string;
  /** Detail, ex "Derniere AG : 15 mai 2025 · a programmer avant mai 2026". */
  detail: string;
  severite: Severite;
  lien?: string;
}

export interface MesEvenements {
  gestionnaire: { nomComplet: string; initiales: string };
  /** Nombre de copros sous gestion (en-tete). */
  nbCopros: number;
  /** Date du jour deja formatee, ex "27 mai 2026". */
  dateCourante: string;
  /** Compteur "actions traitees ce mois" (gamification). */
  actionsCeMois: number;
  aTraiter: ActionATraiter[];
  agAVenir: AgAVenir[];
  coprosSansAg: CoproSansAg[];
}

/** Pourcentage entier de progression d'une AG (0-100). */
export function progressionPct(faits: number, total: number): number {
  return total === 0 ? 0 : Math.round((faits / total) * 100);
}
