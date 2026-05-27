// Primitives de domaine partagees entre features (dashboard, calendrier, ...).
// Domaine pur : aucune dependance technique.

/** Niveau d'urgence porte par la couleur dans toute l'UI (rouge / ambre / neutre). */
export type Severite = "late" | "soon" | "ok";

/** Ton applique a un badge ou une icone, calque sur les couleurs semantiques du DS. */
export type Ton = "err" | "warn" | "ok" | "info" | "neutral";

/** Pastille J-x : le numero de jour + la severite qui porte le sens. */
export interface Jalon {
  /** Libelle court, ex "J-2" ou "+2 j". */
  label: string;
  severite: Severite;
}
