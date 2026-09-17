// Types de VUE + libellés partagés de la fiche d'un dossier de reprise (tableau de suivi
// d'équipe, ADR-037). La page serveur projette un Dossier vers DossierFicheVue (sérialisable),
// les zones client (en-tête, checklist, journal) consomment ces contrats.

import type { EquipeReprise, Etape, StatutEtape } from "@/lib/reprise/domain/dossier";

// Les regles d'une etape (close, echeance depassee) et l'ordre des statuts sont ceux du noyau
// de suivi partage avec la perte : la vue les re-exporte, elle ne les definit pas.
export { STATUTS_ETAPE, etapeClose, echeanceDepassee } from "@/lib/domain/suivi/etape";

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

export const STATUT_ETAPE_LABEL: Record<StatutEtape, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  bloque: "Bloqué",
  fait: "Fait",
  ignore: "Ignoré",
};

// Les initiales d'une personne : UNE definition (domaine collaborateur), le meme avatar partout.
export { initialesDe } from "@/lib/domain/collaborateur";

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

export { formatJour as formatDateCourte } from "@/lib/services/facturation/format";
