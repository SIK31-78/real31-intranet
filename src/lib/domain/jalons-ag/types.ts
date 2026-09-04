// Domaine des jalons reglementaires d'une AG (ADR-006). Types purs.

export type JalonCode =
  | "ODJ_CS"
  | "DEVIS"
  | "CONVOC"
  // RELANCE_POUVOIRS ("Relance date AG", J-7) a ete RETIRE le 2026-09-04 : les
  // gestionnaires ne veulent plus de cette relance. Le code n'est plus emis ni
  // calcule ; d'anciennes lignes intranet_jalons peuvent encore le porter, elles
  // sont simplement ignorees a la lecture (aucun jalon calcule ne les rejoint).
  | "POUVOIRS"
  | "TENUE"
  | "SCAN_CONTRAT"
  | "NOTIF_PV"
  | "ARCHIVAGE";

/** Qui fixe la date : le legal (intangible) ou le cabinet (marge REAL31). */
export type SourceJalon = "legal" | "cabinet";

export interface JalonCalcule {
  code: JalonCode;
  libelle: string;
  /** Date cible effective, ISO "YYYY-MM-DD" (la plus contraignante). */
  cibleDate: string;
  /** Date imposee par le legal, si applicable (transparence). */
  dateLegale?: string;
  /** Date issue des defauts cabinet, si applicable (transparence). */
  dateCabinet?: string;
  source: SourceJalon;
}

export type StatutJalon = "a_faire" | "accompli" | "en_alerte";

/** Jalon calcule + son etat persiste (table intranet_jalons). */
export interface JalonAvecEtat extends JalonCalcule {
  statut: StatutJalon;
  /** Date de realisation, ISO "YYYY-MM-DD". */
  realiseDate?: string;
  /** Initiales de qui a marque. */
  marquePar?: string;
}
