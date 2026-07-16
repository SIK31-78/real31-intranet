// Depassement d'honoraires du Conseil Syndical (CS).
// Portage de `DepassementCSScreen.pa.yaml` (PowerApps REAL31). Fonction pure.
//
// Regle metier (ordre exact de l'ecran PowerApps) :
//   1. duree reelle de la reunion = fin - debut ;
//   2. arrondie a la demi-heure superieure ;
//   3. on retranche la franchise contractuelle (duree de reunion incluse au
//      contrat, `Copropriétés.DureeCS`), plancher a 0 ;
//   4. montant TTC = heures facturables x tarif horaire (TTC), HT = TTC / 1,2.
// Le tarif horaire est celui de l'annee du contrat actif (resolu en amont, hors
// de cette fonction pure).

import { arrondirDemiHeureSuperieure, dureeCreneauMinutes, htDepuisTtc, type Creneau } from "./commun";

export interface DepassementCsInput {
  /** Creneau reel de la reunion du Conseil Syndical. */
  reunion: Creneau;
  /** Franchise contractuelle = `Copropriétés.DureeCS` (heures incluses au contrat),
   *  0 si non renseignee. */
  franchiseHeures: number;
  /** `Tarifs.Tarif` pour l'identifiant "TauxHoraire", annee du contrat actif. TTC. */
  tarifHoraireTtc: number;
}

export interface DepassementCsResult {
  /** Duree reelle arrondie a la demi-heure superieure. */
  heuresArrondies: number;
  /** Heures effectivement facturables (au-dela de la franchise, >= 0). */
  heuresFacturables: number;
  montantTtc: number;
  montantHt: number;
}

/**
 * Calcule le depassement d'honoraires CS facturable pour une reunion donnee.
 * Si la reunion ne depasse pas la franchise, `heuresFacturables` et les montants
 * valent 0 (l'ecran ne cree alors aucune ligne de facturation).
 */
export function calculerDepassementCs(input: DepassementCsInput): DepassementCsResult {
  const { reunion, franchiseHeures, tarifHoraireTtc } = input;

  const dureeMinutes = dureeCreneauMinutes(reunion);
  if (dureeMinutes < 0) {
    throw new Error("Depassement CS : la fin de reunion precede le debut.");
  }

  const heuresArrondies = arrondirDemiHeureSuperieure(dureeMinutes / 60);
  const heuresFacturables = Math.max(heuresArrondies - franchiseHeures, 0);

  const montantTtc = heuresFacturables * tarifHoraireTtc;
  const montantHt = htDepuisTtc(montantTtc);

  return { heuresArrondies, heuresFacturables, montantTtc, montantHt };
}
