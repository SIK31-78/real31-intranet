// Taux du fonds de travaux (loi ALUR) : VERIFIABLE, pas ecrit en dur.
//
// Demande Sekou 2026-09-23 : le modele Word affirmait "(aujourd'hui = 5 % du budget
// annuel)" sans que personne puisse le verifier - alors que le taux legal depend du
// regime de la copropriete. eStale porte les deux montants qu'il faut pour le calculer :
// le budget ALUR de l'exercice et le budget ordinaire du meme exercice.
// Mesure sur S0306 : 5 500 / 110 000 = 5 % exactement.
//
// Deux regimes attendus (art. 14-2 de la loi de 1965, modifie par la loi Climat) :
//   - 5 % du budget previsionnel : regime de droit commun ;
//   - 2,5 % du montant des travaux du PPT : copropriete dotee d'un plan pluriannuel.
// On NE TRANCHE PAS le regime a la place du gestionnaire : on annonce le taux CONSTATE
// et, quand il tombe sur l'un des deux reperes, on le nomme.
//
// Domaine PUR : les montants sont fournis par le service.

/** Taux de droit commun : 5 % du budget previsionnel. */
export const TAUX_ALUR_DROIT_COMMUN = 0.05;
/** Taux des copropriétés dotées d'un plan pluriannuel de travaux : 2,5 %. */
export const TAUX_ALUR_PPT = 0.025;

/** Tolerance d'arrondi pour reconnaitre un repere (0,1 point de pourcentage). */
const TOLERANCE = 0.001;

export interface TauxFondsTravaux {
  /** Le taux constate, ex 0.05. */
  taux: number;
  /** Phrase prete a ecrire dans le document, SANS parenthese. */
  libelle: string;
  /** Le taux tombe sur un repere legal connu. */
  regime: "droit-commun" | "ppt" | "autre";
}

/**
 * Le taux effectivement appele, deduit des deux budgets de l'exercice.
 * `null` si l'un des deux manque ou si le budget ordinaire est nul : on laisse alors la
 * phrase du modele plutot que d'annoncer un taux faux.
 */
export function tauxFondsTravaux(
  budgetAlur: number | undefined,
  budgetOrdinaire: number | undefined,
): TauxFondsTravaux | null {
  if (!budgetAlur || !budgetOrdinaire || budgetOrdinaire <= 0) return null;
  const brut = budgetAlur / budgetOrdinaire;
  // Arrondi au centieme de point : 0.049999 -> 5 %, et 3,75 % reste 3,75 % (arrondir plus
  // grossierement transformait 3,75 en 3,8, soit un taux faux dans le document).
  const taux = Math.round(brut * 10000) / 10000;

  if (Math.abs(taux - TAUX_ALUR_DROIT_COMMUN) <= TOLERANCE) {
    return { taux, regime: "droit-commun", libelle: "aujourd'hui = 5 % du budget annuel" };
  }
  if (Math.abs(taux - TAUX_ALUR_PPT) <= TOLERANCE) {
    return {
      taux,
      regime: "ppt",
      libelle: "aujourd'hui = 2,5 % du budget annuel, taux des copropriétés dotées d'un PPT",
    };
  }
  return { taux, regime: "autre", libelle: `aujourd'hui = ${formatPourcentage(taux)} du budget annuel` };
}

/** 0.0375 -> "3,75 %". */
export function formatPourcentage(taux: number): string {
  const pct = Math.round(taux * 10000) / 100;
  return `${pct.toLocaleString("fr-FR")} %`;
}
