// Honoraires de suivi de travaux. Portage de `SuiviTravauxScreen` (PowerApps).
// Deux modes exclusifs :
//   - pourcentage : HT = montant des travaux HT x (pourcentage / 100) ;
//   - forfait     : l'utilisateur saisit un montant TTC, HT = TTC / 1,2.
//
// Note de portage : l'ecran d'origine calculait le mode pourcentage en passant
// par le TTC (MHT x % x 1,2) avant de rediviser par 1,2 a l'enregistrement.
// L'aller-retour s'annule mathematiquement ; on calcule directement en HT pour
// eviter la derive d'arrondi. Cf. MIGRATION_PLAN.md §2.1.

import { htDepuisTtc } from "./commun";

export type DemandeHonorairesTravaux =
  | { mode: "pourcentage"; montantTravauxHt: number; pourcentage: number }
  | { mode: "forfait"; forfaitTtc: number };

export interface HonorairesTravauxResult {
  montantHt: number;
}

export function calculerHonorairesTravaux(
  demande: DemandeHonorairesTravaux,
): HonorairesTravauxResult {
  if (demande.mode === "pourcentage") {
    const { montantTravauxHt, pourcentage } = demande;
    if (montantTravauxHt < 0) {
      throw new Error("Suivi de travaux : le montant des travaux HT ne peut pas etre negatif.");
    }
    if (pourcentage < 0) {
      throw new Error("Suivi de travaux : le pourcentage d'honoraires ne peut pas etre negatif.");
    }
    return { montantHt: montantTravauxHt * (pourcentage / 100) };
  }

  if (demande.forfaitTtc < 0) {
    throw new Error("Suivi de travaux : le forfait ne peut pas etre negatif.");
  }
  return { montantHt: htDepuisTtc(demande.forfaitTtc) };
}
