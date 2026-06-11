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
  /** Relance des pouvoirs / VPC (rappel Outlook fiche 450). */
  RELANCE_POUVOIRS_JOURS: 8,
  /** Pouvoirs et votes par correspondance recus (butoir). */
  POUVOIRS_JOURS: 2,
  // --- Post-AG (jours APRES la tenue) ---
  /** Scan du contrat + evenement Crypto (fiche 450 : J+2 max). */
  SCAN_CONTRAT_JOURS: 2,
  /** Notification du PV (process 470 ; max 1 mois). */
  NOTIF_PV_JOURS: 30,
  /** Archivage du dossier AG (6 mois apres l'AG). */
  ARCHIVAGE_JOURS: 180,
} as const;
