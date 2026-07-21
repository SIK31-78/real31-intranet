// Recapitulatif commun a toutes les prestations, calcule SANS rien ecrire.
//
// Chaque prestation a ses propres criteres (heures pour un depassement, taux
// pour des travaux, diligences pour un sinistre...) mais l'ecran de validation
// est le meme : on expose donc une forme unique, et chaque service la remplit.
// L'apercu et la creation partagent le meme calcul, ils ne peuvent pas diverger.

import type { TypePrestation } from "@/lib/ports/facturation-repository";

/** Une ligne du recapitulatif affiche avant confirmation. */
export interface LigneApercu {
  libelle: string;
  valeur: string;
  /** `contrat` = ce qui est deja couvert, `fort` = le montant a facturer. */
  accent?: "contrat" | "fort";
}

export interface ApercuFacturation {
  typePrestation: TypePrestation;
  /** Intitule de la prestation, affiche en tete de la fenetre. */
  titre: string;
  coproCode: string;
  /** Criteres retenus, dans l'ordre d'affichage. */
  details: LigneApercu[];
  /** Lignes qui composeront la facture. */
  lignes: Array<{ description: string; montantHt: number }>;
  montantHt: number;
  montantTtc: number;
  /**
   * Alertes non bloquantes affichees sur l'ecran de validation (ex. fonds
   * travaux sous le minimum legal). L'utilisateur peut confirmer malgre tout.
   */
  avertissements?: string[];
  /** Vrai si rien n'est facturable : aucune facture ne sera creee. */
  rienAFacturer: boolean;
  /** Message explicatif quand il n'y a rien a facturer. */
  motifRienAFacturer?: string;
}
