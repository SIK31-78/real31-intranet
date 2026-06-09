// Defauts cabinet REAL31 (ADR-006). Marges propres au cabinet, plus strictes ou
// egales au legal. Surchargeables a terme via la table cabinet_settings (fallback
// sur ces constantes). Exprimes en jours calendaires avant la tenue de l'AG.

export const DELAIS_CABINET = {
  /** ODJ valide avec le Conseil Syndical. */
  ODJ_CS_JOURS: 45,
  /** Devis et documents techniques rassembles. */
  DEVIS_JOURS: 45,
  /** Convocations envoyees (aligne sur le legal, borne par le calcul jours francs). */
  CONVOC_JOURS: 21,
  /** Pouvoirs et votes par correspondance recus (relance recommandee a J-5). */
  POUVOIRS_JOURS: 2,
} as const;
