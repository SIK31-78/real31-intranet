// Fonds travaux (loi ALUR) : regles de saisie au moment du recap AG.
//
// Deux cas exclusifs :
//   - un PPT a ete vote : le fonds travaux suit le plan vote ;
//   - aucun PPT vote : le fonds est un pourcentage du budget previsionnel, avec
//     un MINIMUM LEGAL de reference.
//
// Le minimum est un AVERTISSEMENT, pas un blocage (decision Sekou, 2026-07-21) :
// des copropriétés peuvent legitimement etre en dessous (dispense votee, immeuble
// recent...). On alerte donc a la validation, et le gestionnaire tranche en
// connaissance de cause plutot que d'etre bloque par l'outil.

import { formatEuros } from "@/lib/domain/format-montant";

/** Minimum legal de reference du fonds travaux, en % du budget previsionnel. */
export const POURCENTAGE_FONDS_TRAVAUX_MINIMUM = 5;

export interface SaisieFondsTravaux {
  /** Un PPT a-t-il ete vote a cette AG ? */
  pptVote?: boolean;
  /** Pourcentage du budget previsionnel affecte au fonds travaux. */
  pourcentageBudget?: number;
}

/**
 * Verifie la saisie du fonds travaux.
 * Renvoie un message d'avertissement si le pourcentage passe sous le minimum
 * legal, `null` si tout est conforme. Ne leve jamais : la saisie reste possible.
 */
export function avertissementFondsTravaux(saisie: SaisieFondsTravaux): string | null {
  // PPT vote : le fonds travaux est adosse au plan, pas au budget.
  if (saisie.pptVote === true) return null;
  // Non renseigne : rien a verifier (le champ reste optionnel).
  if (saisie.pourcentageBudget === undefined) return null;

  if (saisie.pourcentageBudget < POURCENTAGE_FONDS_TRAVAUX_MINIMUM) {
    return (
      `Fonds travaux a ${saisie.pourcentageBudget} %, sous le minimum legal de ` +
      `${POURCENTAGE_FONDS_TRAVAUX_MINIMUM} % du budget previsionnel. ` +
      `A ne valider que si la copropriete en est dispensee.`
    );
  }
  return null;
}

/** Montant annuel du fonds travaux : budget vote x pourcentage, arrondi au centime. */
export function montantFondsTravaux(budget: number, pourcentage: number): number {
  return Math.round(budget * pourcentage) / 100;
}

/**
 * Ligne « Fonds travaux (ALUR) » de la vue comptable du recap (remontee ee96b2d8) : le
 * pourcentage saisi est celui du FONDS TRAVAUX, pas une evolution du budget. On fusionne
 * le Oui/Non et le pourcentage, et on donne le montant quand le budget vote est connu.
 *   ex. « Oui : 5 % du budget, soit 1 250,00 € »
 */
export function libelleFondsTravaux(saisie: {
  fondsTravaux?: boolean;
  pourcentageBudget?: number;
  montantBudget?: number;
}): string {
  if (saisie.fondsTravaux === false) return "Non";
  const prefixe = saisie.fondsTravaux === true ? "Oui" : "";
  if (saisie.pourcentageBudget === undefined) return prefixe || "non renseigné";
  const pct = `${String(saisie.pourcentageBudget).replace(".", ",")} % du budget`;
  const montant =
    saisie.montantBudget !== undefined
      ? `, soit ${formatEuros(montantFondsTravaux(saisie.montantBudget, saisie.pourcentageBudget))}`
      : "";
  return prefixe ? `${prefixe} : ${pct}${montant}` : `${pct}${montant}`;
}
