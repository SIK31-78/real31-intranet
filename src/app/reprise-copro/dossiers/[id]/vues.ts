// Types de VUE + libellés partagés de la fiche d'un dossier de reprise (tableau de suivi
// d'équipe, ADR-037). La page serveur projette un Dossier vers DossierFicheVue (sérialisable),
// les zones client (en-tête, checklist, journal) consomment ces contrats.

import type { EquipeReprise, Etape, StatutEtape } from "@/lib/reprise/domain/dossier";

/** Une étape telle que persistée : le domaine est déjà sérialisable, on le réutilise tel quel. */
export type EtapeVue = Etape;

export interface EntreeJournalVue {
  date: string;
  texte: string;
  auteur?: string;
}

/** Vue sérialisable d'un dossier pour la fiche. */
export interface DossierFicheVue {
  ref: string;
  nomUsuel: string;
  adresse?: string;
  sortant?: string;
  /** ISO date (AAAA-MM-JJ). */
  dateBascule?: string;
  archive: boolean;
  avancement: number; // 0..1
  etapesFaites: number;
  etapesTotal: number;
  etapes: EtapeVue[];
  equipe: EquipeReprise;
  journal: EntreeJournalVue[];
}

/** Ordre des statuts dans le menu de la pastille. */
export const STATUTS_ETAPE: readonly StatutEtape[] = ["a_faire", "en_cours", "bloque", "fait", "ignore"];

export const STATUT_ETAPE_LABEL: Record<StatutEtape, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  bloque: "Bloqué",
  fait: "Fait",
  ignore: "Ignoré",
};

export const STATUT_ETAPE_TON: Record<StatutEtape, "neutral" | "info" | "err" | "ok"> = {
  a_faire: "neutral",
  en_cours: "info",
  bloque: "err",
  fait: "ok",
  ignore: "neutral",
};

/** Une étape « close » (fait ou ignoré) ne compte plus dans le reste à faire. */
export function etapeClose(statut: StatutEtape): boolean {
  return statut === "fait" || statut === "ignore";
}

/** Échéance dépassée = date strictement avant aujourd'hui, sur une étape encore ouverte. */
export function echeanceDepassee(etape: { statut: StatutEtape; echeance?: string }, aujourdHuiIso: string): boolean {
  return Boolean(etape.echeance) && !etapeClose(etape.statut) && etape.echeance! < aujourdHuiIso.slice(0, 10);
}

/** Initiales d'un nom complet (« Sekou Koma » -> « SK ») pour l'avatar d'une personne assignée. */
export function initialesDe(nom: string): string {
  const parts = nom.trim().split(/[\s-]+/).filter(Boolean);
  const ini = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return ini.slice(0, 2) || "?";
}

/** « 9 sept. 2026 à 14:32 » à partir d'un ISO complet ; déterministe (UTC) pour éviter les hydration mismatches. */
export function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${jj}/${mm}/${d.getUTCFullYear()} ${hh}:${mi}`;
}

/** « 12/04/2026 » à partir d'une ISO date (ou d'un ISO complet). */
export function formatDateCourte(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
