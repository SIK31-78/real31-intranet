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
import { agDueDeadline, agTenuePourExerciceCourant } from "@/lib/domain/parcours-ag";

export type EtatCycle = "a_planifier" | "a_venir" | "en_preparation" | "convoquee" | "tenue";

export interface EtatCycleInfo {
  etat: EtatCycle;
  /** Pour a_planifier : le delai legal d'AG (cloture + 6 mois) est depasse. */
  enRetard: boolean;
}

// Fenetre de preparation : une AG datee au-dela n'est pas "en preparation" (rien a
// faire maintenant) -> etat "a_venir" calme. Evite que des dates lointaines/placeholder
// (ex 31/12) inondent le cockpit.
const FENETRE_PREPA_JOURS = 150;

export const ETAT_CYCLE_LABEL: Record<EtatCycle, string> = {
  a_planifier: "À planifier",
  a_venir: "À venir",
  en_preparation: "En préparation",
  convoquee: "Convoquée",
  tenue: "Tenue",
};

/** Ordre du pipeline, de gauche a droite (progression du cycle). */
export const ETAT_CYCLE_ORDRE: EtatCycle[] = [
  "a_planifier",
  "a_venir",
  "en_preparation",
  "convoquee",
  "tenue",
];

function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}

/**
 * Etat du cycle AG d'une copro. `convocAccompli` = le jalon CONVOC est marque accompli
 * dans l'intranet (decision Sekou : "Convoquee" sur coche explicite, pas deduit).
 */
export function etatCycleAg(c: Copropriete, convocAccompli: boolean, today: string): EtatCycleInfo {
  const agDate = c.prochaineAg?.date;
  if (!agDate) {
    // Pas de prochaine date : deux cas TRES differents (bug Sekou 2026-07-17 - des AG deja
    // tenues cette annee tombaient dans "A planifier"). Si l'AG de l'exercice courant a
    // DEJA eu lieu (conclue -> prochaine date videe), il n'y a rien a planifier avant la
    // cloture suivante : la copro est en suivi post-AG ("tenue"), pas en attente d'action.
    // Au prochain exercice clos, agTenuePourExerciceCourant repasse false -> "a planifier".
    if (agTenuePourExerciceCourant(c, today)) return { etat: "tenue", enRetard: false };
    const deadline = agDueDeadline(c, today);
    return { etat: "a_planifier", enRetard: deadline !== null && deadline < today };
  }
  if (agDate < today) return { etat: "tenue", enRetard: false };
  if (joursEntre(today, agDate) > FENETRE_PREPA_JOURS) return { etat: "a_venir", enRetard: false };
  if (convocAccompli) return { etat: "convoquee", enRetard: false };
  return { etat: "en_preparation", enRetard: false };
}
