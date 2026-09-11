// Defauts cabinet REAL31 (ADR-006). Marges propres au cabinet, plus strictes ou
// egales au legal. Surchargeables a terme via la table cabinet_settings (fallback
// sur ces constantes). Exprimes en jours calendaires avant la tenue de l'AG.

// RETROPLANNING REVU LE 2026-09-11 (Sekou, sur le parcours reel). Deux ODJ distincts,
// qu'il ne faut jamais confondre :
//   - l'ODJ DU CS  : le document de travail prepare par le gestionnaire et envoye au
//     conseil syndical avant sa reunion (c'est celui de /odj/<id>) ;
//   - l'ODJ DE L'AG : l'ordre du jour legal, valide avec le conseil, qui part DANS la
//     convocation. "L'ODJ = la convocation" (Sekou) : il n'y a pas d'acte "preparer la
//     convocation" separe, la convocation EST cet ODJ mis sous pli.
// La reunion du conseil syndical n'a pas de cible ici : sa date est libre, posee par le
// gestionnaire. Elle se tient entre les deux jalons ci-dessous.
export const DELAIS_CABINET = {
  /** ODJ DU CS prepare et envoye au conseil syndical (7 semaines). Ce jalon n'existait
   *  pas : "ODJ valide" tombait de nulle part, sans geste qui le precede. */
  ODJ_PREP_JOURS: 49,
  /** ODJ DE L'AG valide avec le Conseil Syndical (5 semaines). Etait a 45 j : le
   *  decoupage en deux temps (preparer a J-49, valider a J-35) colle au parcours reel.
   *  NB : la limite d'ajout de points tombe a J-41, donc AVANT cette validation - et
   *  c'est dans le bon ordre, contrairement a avant (valider a J-45 puis fermer les
   *  ajouts a J-41). */
  ODJ_CS_JOURS: 35,
  /** Devis et documents techniques rassembles (7 semaines). Remontes de 45 a 49 j :
   *  on ne prepare pas un ordre du jour sans les devis qu'il annonce. */
  DEVIS_JOURS: 49,
  /** Mise sous pli = envoi des convocations (c'est le MEME acte : cocher "mise sous
   *  pli faite" vaut "convocations parties"). 31 jours avant l'AG (regle cabinet,
   *  pour ne pas etre tributaire des delais postaux ; le legal 21 jours francs
   *  reste le plancher, cf. dateConvocationLegale -> a J-31 le cabinet est plus
   *  contraignant, la cible reste J-31 et le plancher legal est tenu).
   *  MAINTENU A 31 j le 2026-09-11 : "4 semaines" aurait donne J-28 et un
   *  retroplanning en semaines rondes, mais au prix de 3 jours de marge postale.
   *  Sekou a tranche pour la marge (la convocation ne doit pas dependre de La Poste). */
  CONVOC_JOURS: 31,
  /** Date limite d'ajout de points a l'ODJ : 10 jours avant la mise sous pli
   *  (soit J-41 depuis que la mise sous pli est passee a J-31 - glissement
   *  mecanique, aucune date en dur ailleurs). */
  AJOUT_ODJ_AVANT_CONVOC_JOURS: 10,
  // RELANCE_POUVOIRS_JOURS (relance date AG a J-7, fiche 450) : RETIRE le 2026-09-04.
  // Les gestionnaires ne veulent plus de cette relance - ni jalon, ni creneau Outlook.
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
