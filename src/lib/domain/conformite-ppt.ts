// Item de conformite PPT de la fiche copro (regle Sekou 2026-07-28) :
//   - PPT vote -> "PPT voté" (ok), comme avant ;
//   - pas de PPT vote + annee de construction CONNUE :
//       echeance = annee + 15 (l'obligation PPT vise les copros de plus de 15 ans) ;
//       * echeance a plus de 2 ans  -> AUCUNE alerte (immeuble recent : on ne crie pas) ;
//       * echeance dans <= 2 ans    -> "PPT à prévoir en <annee>" (attention / orange) ;
//       * echeance depassee         -> "PPT à prévoir depuis <annee>" (ko / rouge) ;
//   - pas de PPT vote + annee INCONNUE -> "PPT à programmer" (attention), comportement
//     historique en attendant que les annees de construction soient completees ;
//   - pptVote inconnu (undefined) -> aucun item (on n'invente pas).
// Module PUR : teste offline, consomme par get-fiche-copro.

import type { ItemConformite } from "@/lib/domain/copropriete";

/** Nb d'annees au-dela desquelles l'obligation PPT s'applique (immeuble > 15 ans). */
export const AGE_OBLIGATION_PPT = 15;

/** Fenetre d'anticipation : l'alerte "à prévoir" apparait quand l'echeance est a <= 2 ans. */
export const FENETRE_ALERTE_PPT_ANS = 2;

export function itemConformitePpt(
  pptVote: boolean | undefined,
  anneeConstruction: number | undefined,
  anneeCourante: number,
): ItemConformite | null {
  if (pptVote === true) return { libelle: "PPT voté", etat: "ok" };
  if (pptVote === undefined) return null;

  // pptVote === false : l'alerte depend de l'age de l'immeuble.
  if (anneeConstruction === undefined) {
    return { libelle: "PPT à programmer", etat: "attention" };
  }
  const echeance = anneeConstruction + AGE_OBLIGATION_PPT;
  if (echeance - anneeCourante > FENETRE_ALERTE_PPT_ANS) return null; // immeuble recent
  if (echeance < anneeCourante) {
    return { libelle: `PPT à prévoir depuis ${echeance}`, etat: "ko" };
  }
  return { libelle: `PPT à prévoir en ${echeance}`, etat: "attention" };
}
