// Delais legaux (loi 65-557, decret 67-223). Constantes intangibles, citees.
// Le depassement engage la responsabilite civile du syndic : aucune valeur ici
// ne doit etre relachee. Revue juridique recommandee avant usage prescriptif.

export const DELAIS_LEGAUX = {
  /** Convocation de l'AG : 21 jours francs minimum avant la tenue.
   *  Art. 9 decret 67-223. "Jours francs" = on ne compte ni le jour d'envoi
   *  ni le jour de l'AG. */
  CONVOCATION_AG_JOURS_FRANCS: 21,
} as const;
