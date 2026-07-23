// Facturation de gestion courante trimestrielle. Portage du flow legacy
// REALFacturationGestionCourante. Fonction pure.
//
// Le contrat porte des montants ANNUELS ; on facture un trimestre :
//   - honoraires : annuel TTC / 4, puis converti HT (annuel se voit appliquer
//     la TVA a 20 %) -> annuTtc / 4 / 1,2 ;
//   - timbres (frais postaux) : annuel / 4, SANS TVA (refacturation de debours,
//     hors champ TVA) -> le montant est facture tel quel. C'est exactement ce
//     que faisait le legacy (div par 4 seulement, jamais par 1,2).
//
// Exception : les copros en FRAIS POSTAUX REELS ne se voient pas facturer le
// forfait de timbres (leurs frais sont refactures au reel, ailleurs) -> timbres 0.

import { htDepuisTtc } from "./commun";

export interface TrimestreGestionCourante {
  /** Honoraires de gestion du trimestre, HT. */
  honorairesHt: number;
  /** Forfait de frais postaux du trimestre (sans TVA). 0 si copro en frais reels. */
  timbres: number;
}

export function calculerTrimestreGestionCourante(
  honorairesAnnuelsTtc: number,
  forfaitPostauxAnnuel: number,
  fraisPostauxReels = false,
): TrimestreGestionCourante {
  if (honorairesAnnuelsTtc < 0 || forfaitPostauxAnnuel < 0) {
    throw new Error("Gestion courante : les montants annuels ne peuvent pas etre negatifs.");
  }
  return {
    honorairesHt: htDepuisTtc(honorairesAnnuelsTtc / 4),
    // Frais reels refactures ailleurs : aucun forfait de timbres pour ces copros.
    // Sinon, forfait annuel / 4 (sans TVA).
    timbres: fraisPostauxReels ? 0 : forfaitPostauxAnnuel / 4,
  };
}
