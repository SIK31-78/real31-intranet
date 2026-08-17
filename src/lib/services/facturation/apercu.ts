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
  /**
   * Libelle du bouton de confirmation quand `rienAFacturer` est vrai mais qu'il
   * reste quelque chose a ENREGISTRER.
   *
   * `rienAFacturer` dit qu'aucune facture ne partira -- PAS qu'il n'y a rien a
   * faire. Pour les 5 prestations de facturation les deux se confondent (pas de
   * depassement = rien a garder), mais pas pour le recap AG : le compte-rendu
   * est le livrable, la facture n'en est qu'une retombee. Sans ce champ, la
   * fenetre ne proposait que "Fermer" et un recap d'AG tenue dans les horaires
   * du contrat ne pouvait JAMAIS etre enregistre.
   *
   * Absent = comportement d'origine (rien a facturer -> rien a faire -> Fermer).
   */
  actionSansFacture?: string;
}
