// Domaine des jalons reglementaires d'une AG (ADR-006). Types purs.

export type JalonCode = "ODJ_CS" | "DEVIS" | "CONVOC" | "POUVOIRS" | "TENUE";

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
