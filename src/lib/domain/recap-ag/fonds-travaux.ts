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
