// Depassement horaire d'Assemblee Generale (AG).
// Portage de `NewRecapAGScreen1.pa.yaml` (PowerApps REAL31). Fonction pure.
//
// Plus riche que le depassement CS : la plage contractuelle est bornee par deux
// HEURES DE LA JOURNEE ([Début Min AG ; Fin max AG]), pas par une simple duree.
// Le depassement est calcule separement pour la partie "dans la plage" et la
// partie "hors plage", chaque bloc etant arrondi a la demi-heure superieure puis
// somme.
//
// Trois cas (repris a l'identique de PowerApps) :
//   - Cas 1 : reunion entierement dans les bornes mais plus longue que la duree
//     contractuelle (`Durée AG`) -> exces = duree dans plage - duree contractuelle ;
//   - Cas 2 : reunion commencee dans les bornes mais terminee apres la borne de fin
//     -> meme exces dans la plage, ET la partie hors plage compte aussi (cas 3) ;
//   - Cas 3 : partie de reunion hors des bornes (avant Début Min ou apres Fin max) ;
//     si la reunion est entierement hors bornes, tout compte.
//
// Tarif horaire = annee PRECEDANT la date de debut d'AG (`Year(DateAG) - 1`) : une
// AG de l'annee N+1 approuve l'exercice clos au 31/12/N, on facture au tarif de cet
// exercice. Resolu en amont (hors de cette fonction pure).
// Cf. mythec-refactor/powerapps/MIGRATION_PLAN.md #2.

import { arrondirDemiHeureSuperieure, creneauEnMinutes, htDepuisTtc, type Creneau } from "./commun";

export interface DepassementAgInput {
  /** Creneau reel de l'AG. */
  assemblee: Creneau;
  /** `Copropriétés."Durée AG"` : duree de reunion incluse au contrat, en heures. */
  dureeAgContractuelleHeures: number;
  /** `Copropriétés."Début Min AG"` : heure de la journee (0-24) a partir de laquelle
   *  la reunion est dans la plage contractuelle. */
  debutMinAgHeure: number;
  /** `Copropriétés."Fin max AG"` : heure de la journee (0-24) au-dela de laquelle la
   *  reunion est hors plage contractuelle. */
  finMaxAgHeure: number;
  /** `Tarifs.Tarif` "TauxHoraire", annee N-1 par rapport a la date d'AG. TTC. */
  tarifHoraireTtc: number;
}

export interface DepassementAgResult {
  dureeTotaleHeures: number;
  /** Depassement (arrondi) imputable a la partie de reunion dans les bornes. */
  depassementDansPlageHeures: number;
  /** Depassement (arrondi) imputable a la partie de reunion hors des bornes. */
  depassementHorsPlageHeures: number;
  totalDepassementHeures: number;
  montantTtc: number;
  montantHt: number;
}

/**
 * Calcule le depassement horaire facturable d'une AG.
 *
 * Note (comportement legacy reproduit tel quel) : les cas 1 et 2 ne s'appliquent
 * que si la reunion COMMENCE dans la plage (`debut >= Début Min AG`). Une AG qui
 * demarre avant l'heure minimale ne fait donc facturer que sa partie hors plage,
 * pas son eventuel exces de duree a l'interieur des bornes. C'est le comportement
 * de l'ecran PowerApps d'origine.
 */
export function calculerDepassementAg(input: DepassementAgInput): DepassementAgResult {
  const { assemblee, dureeAgContractuelleHeures, debutMinAgHeure, finMaxAgHeure, tarifHoraireTtc } = input;

  const { debut, fin } = creneauEnMinutes(assemblee);
  if (fin <= debut) {
    throw new Error("Depassement AG : la fin d'AG doit etre posterieure au debut.");
  }

  const debutMin = debutMinAgHeure * 60;
  const finMax = finMaxAgHeure * 60;

  const dureeTotaleHeures = (fin - debut) / 60;
  const dureeDansPlageMinutes = Math.max(0, Math.min(fin, finMax) - Math.max(debut, debutMin));
  const dureeDansPlageHeures = dureeDansPlageMinutes / 60;
  const dureeHorsPlageHeures = Math.max(0, dureeTotaleHeures - dureeDansPlageHeures);

  const commenceDansPlage = debut >= debutMin;
  const finitDansPlage = fin <= finMax;
  const entierementHorsPlage = debut > finMax || fin < debutMin;

  // Cas 1 : tout dans la plage, plus long que la duree contractuelle.
  const depassementDansPlage =
    commenceDansPlage && finitDansPlage && dureeDansPlageHeures > dureeAgContractuelleHeures
      ? dureeDansPlageHeures - dureeAgContractuelleHeures
      : 0;

  // Cas 2 : commence dans la plage, finit apres la borne de fin.
  const depassementMixte =
    commenceDansPlage && !finitDansPlage && dureeDansPlageHeures > dureeAgContractuelleHeures
      ? dureeDansPlageHeures - dureeAgContractuelleHeures
      : 0;

  // Cas 3 : partie hors bornes (ou reunion entierement hors bornes).
  const depassementHorsPlage = entierementHorsPlage ? dureeTotaleHeures : dureeHorsPlageHeures;

  const depassementDansPlageHeures = arrondirDemiHeureSuperieure(depassementDansPlage + depassementMixte);
  const depassementHorsPlageHeures = arrondirDemiHeureSuperieure(depassementHorsPlage);
  const totalDepassementHeures = depassementDansPlageHeures + depassementHorsPlageHeures;

  const montantTtc = totalDepassementHeures * tarifHoraireTtc;
  const montantHt = htDepuisTtc(montantTtc);

  return {
    dureeTotaleHeures,
    depassementDansPlageHeures,
    depassementHorsPlageHeures,
    totalDepassementHeures,
    montantTtc,
    montantHt,
  };
}
