// Etat de suivi d'un recap AG cote GESTIONNAIRE : « effectué » ou « à faire ».
//
// Le marqueur est un HORODATAGE en base (effectue_at), pas un booleen : on veut
// savoir QUAND, et un horodatage absent se lit sans ambiguite comme « pas fait ».
// La conversion horodatage -> etat vit ici, en fonction pure, parce que trois
// endroits en dependent (le badge, le libelle du bouton, le compteur) et qu'ils
// n'ont pas le droit de diverger.
//
// A NE PAS confondre avec l'etat « traité » du pole comptable
// (ports/recap-ag-repository, TraitementComptable) : deux boucles differentes.

/** Ce dont on a besoin pour trancher : rien de plus que la marque. */
export interface RecapMarquable {
  /** Horodatage ISO du marquage ; absent = reste a faire. */
  effectueLe?: string;
}

export type EtatSuiviRecap = "effectue" | "a_faire";

export function etatSuiviRecap(recap: RecapMarquable): EtatSuiviRecap {
  // Une chaine vide n'est pas un horodatage : elle vaut « pas fait ».
  return recap.effectueLe ? "effectue" : "a_faire";
}

export function estEffectue(recap: RecapMarquable): boolean {
  return etatSuiviRecap(recap) === "effectue";
}

/** Combien restent a faire dans ce lot (compteur d'en-tete). */
export function compterAFaire(recaps: readonly RecapMarquable[]): number {
  return recaps.filter((r) => !estEffectue(r)).length;
}
