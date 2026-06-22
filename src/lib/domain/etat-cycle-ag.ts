// Etat du cycle AG d'une copro : LA colonne vertebrale du cockpit (decision Sekou
// 2026-06-22). Une copro est toujours dans UN seul etat clair. Logique PURE (domaine).
//
// 4 etats (Cloturee est transitoire : conclure une AG vide la prochaine date -> la
// copro repasse "A planifier" pour le cycle suivant, cf. conclureAgAction) :
//   a_planifier   : pas de prochaine AG fixee (enRetard si delai legal depasse)
//   en_preparation: AG fixee, convocation pas encore marquee envoyee
//   convoquee     : convocation marquee envoyee (coche explicite, decision Sekou)
//   tenue         : la date d'AG est passee, suivi post-AG en cours

import type { Copropriete } from "@/lib/domain/copropriete";
import { agDueDeadline } from "@/lib/domain/parcours-ag";

export type EtatCycle = "a_planifier" | "en_preparation" | "convoquee" | "tenue";

export interface EtatCycleInfo {
  etat: EtatCycle;
  /** Pour a_planifier : le delai legal d'AG (cloture + 6 mois) est depasse. */
  enRetard: boolean;
}

export const ETAT_CYCLE_LABEL: Record<EtatCycle, string> = {
  a_planifier: "À planifier",
  en_preparation: "En préparation",
  convoquee: "Convoquée",
  tenue: "Tenue",
};

/** Ordre du pipeline, de gauche a droite. */
export const ETAT_CYCLE_ORDRE: EtatCycle[] = ["a_planifier", "en_preparation", "convoquee", "tenue"];

/**
 * Etat du cycle AG d'une copro. `convocAccompli` = le jalon CONVOC est marque accompli
 * dans l'intranet (decision Sekou : "Convoquee" sur coche explicite, pas deduit).
 */
export function etatCycleAg(c: Copropriete, convocAccompli: boolean, today: string): EtatCycleInfo {
  const agDate = c.prochaineAg?.date;
  if (!agDate) {
    const deadline = agDueDeadline(c, today);
    return { etat: "a_planifier", enRetard: deadline !== null && deadline < today };
  }
  if (agDate < today) return { etat: "tenue", enRetard: false };
  if (convocAccompli) return { etat: "convoquee", enRetard: false };
  return { etat: "en_preparation", enRetard: false };
}
