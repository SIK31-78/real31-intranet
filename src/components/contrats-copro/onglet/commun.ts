// Petits outils partagés par les morceaux de l'onglet « Contrats » : tons des niveaux,
// formats, sélection des cycles. Rien de visuel ici.

import type { BadgeTon } from "@/components/ui/badge";
import { formatEuros } from "@/lib/domain/format-montant";
import { formatJourFR, type NiveauQualifie } from "@/lib/domain/contrats-copro";
import type { CycleVue } from "@/lib/services/contrats-copro/types";

export const A_RENSEIGNER = "à renseigner";

/** Niveau -> ton d'une pastille (rouge err, orange warn, vert ok, à compléter neutre). */
export function tonNiveau(n: NiveauQualifie | null | undefined): BadgeTon {
  switch (n) {
    case "rouge":
      return "err";
    case "orange":
      return "warn";
    case "vert":
      return "ok";
    default:
      return "neutral";
  }
}

/** Le même, pour la note d'un `Stat`. */
export function tonStat(n: NiveauQualifie | null | undefined): "neutral" | "ok" | "warn" | "err" {
  switch (n) {
    case "rouge":
      return "err";
    case "orange":
      return "warn";
    case "vert":
      return "ok";
    default:
      return "neutral";
  }
}

export function euros(n: number | null | undefined, defaut = A_RENSEIGNER): string {
  return typeof n === "number" && Number.isFinite(n) ? formatEuros(n, { decimales: "auto" }) : defaut;
}

export function jour(iso: string | null | undefined, defaut = A_RENSEIGNER): string {
  return iso ? formatJourFR(iso) : defaut;
}

export function pluriel(n: number, singulier: string, plurielMot = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielMot : singulier}`;
}

export function cyclesEnCours(vues: readonly CycleVue[]): CycleVue[] {
  return vues.filter((v) => v.cycle.statut === "en_cours");
}

export function cyclesPasses(vues: readonly CycleVue[]): CycleVue[] {
  return vues.filter((v) => v.cycle.statut !== "en_cours");
}

/** Ce que le niveau d'un cycle veut dire, en trois mots (note d'un Stat, en-tête d'un cycle). */
export function texteNiveau(v: CycleVue): string {
  if (v.aDemarrer) return "suivi à démarrer";
  if (v.niveau === "a_completer") return "échéance à compléter";
  if (v.niveau === "vert") return "en cours";
  return `dossier figé depuis ${v.joursSansAvancement ?? 0} j`;
}

/** L'échéance la plus proche parmi des cycles ; null si aucune n'est saisie. */
export function echeanceLaPlusProche(vues: readonly CycleVue[]): string | null {
  let min: string | null = null;
  for (const v of vues) {
    const e = v.cycle.echeanceISO;
    if (e && (min === null || e < min)) min = e;
  }
  return min;
}

/** « 1 234,5 » ou « 1234.50 » -> 1234.5 ; null si vide ; NaN si illisible. */
export function nombreSaisi(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".").trim();
  if (t === "") return null;
  return Number(t);
}

export function ouNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}
