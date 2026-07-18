// Defauts cabinet REAL31 (ADR-006). Marges propres au cabinet, plus strictes ou
// egales au legal. Surchargeables a terme via la table cabinet_settings (fallback
// sur ces constantes). Exprimes en jours calendaires avant la tenue de l'AG.

export const DELAIS_CABINET = {
  /** ODJ valide avec le Conseil Syndical. */
  ODJ_CS_JOURS: 45,
  /** Devis et documents techniques rassembles. */
  DEVIS_JOURS: 45,
  /** Mise sous pli = envoi des convocations (c'est le MEME acte : cocher "mise sous
   *  pli faite" vaut "convocations parties"). 31 jours avant l'AG (regle cabinet,
   *  pour ne pas etre tributaire des delais postaux ; le legal 21 jours francs
   *  reste le plancher, cf. dateConvocationLegale -> a J-31 le cabinet est plus
   *  contraignant, la cible reste J-31 et le plancher legal est tenu). */
  CONVOC_JOURS: 31,
  /** Date limite d'ajout de points a l'ODJ : 10 jours avant la mise sous pli
   *  (soit J-41 depuis que la mise sous pli est passee a J-31 - glissement
   *  mecanique, aucune date en dur ailleurs). */
  AJOUT_ODJ_AVANT_CONVOC_JOURS: 10,
  /** Relance date AG (relance des pouvoirs / VPC, fiche 450) : 7 jours avant l'AG. */
  RELANCE_POUVOIRS_JOURS: 7,
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
