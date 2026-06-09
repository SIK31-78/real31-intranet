// Calculateur des jalons d'une AG (ADR-006). Pur, deterministe (UTC).
// Cible = la date la plus contraignante entre le legal et le defaut cabinet.

import { DELAIS_LEGAUX } from "./legal/delais";
import { DELAIS_CABINET } from "./cabinet/real31-defaults";
import { joursFeries } from "./jours-feries";
import type { JalonCalcule, JalonCode } from "./types";

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function moinsJours(isoDate: string, n: number): string {
  const d = parseISO(isoDate);
  d.setUTCDate(d.getUTCDate() - n);
  return toISO(d);
}
function estChomme(d: Date, feries: Set<string>): boolean {
  const jour = d.getUTCDay(); // 0 = dimanche, 6 = samedi
  return jour === 0 || jour === 6 || feries.has(toISO(d));
}

/** Date limite d'envoi de la convocation : 21 jours francs avant l'AG.
 *  Jours francs = ni le jour d'envoi ni le jour de l'AG ne comptent, d'ou
 *  AG - (21 + 1) jours calendaires. Si ce jour est chomme (week-end / ferie),
 *  on recule au jour ouvre precedent (envoyer plus tot reste valide). */
function dateConvocationLegale(agISO: string): string {
  const d = parseISO(moinsJours(agISO, DELAIS_LEGAUX.CONVOCATION_AG_JOURS_FRANCS + 1));
  const feries = joursFeries(d.getUTCFullYear());
  while (estChomme(d, feries)) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return toISO(d);
}

const LIBELLES: Record<JalonCode, string> = {
  ODJ_CS: "ODJ valide avec le Conseil Syndical",
  DEVIS: "Devis et documents techniques rassembles",
  CONVOC: "Convocations envoyees",
  POUVOIRS: "Pouvoirs et votes par correspondance recus",
  TENUE: "Tenue de l'AG",
};

/** Calcule les 5 jalons d'une AG a partir de sa date (ISO "YYYY-MM-DD"). */
export function calculerJalons(agISO: string): JalonCalcule[] {
  const convocLegale = dateConvocationLegale(agISO);
  const convocCabinet = moinsJours(agISO, DELAIS_CABINET.CONVOC_JOURS);
  // La plus contraignante = la plus tot = la plus petite date ISO.
  const convocCible = convocLegale <= convocCabinet ? convocLegale : convocCabinet;

  return [
    { code: "ODJ_CS", libelle: LIBELLES.ODJ_CS, cibleDate: moinsJours(agISO, DELAIS_CABINET.ODJ_CS_JOURS), source: "cabinet" },
    { code: "DEVIS", libelle: LIBELLES.DEVIS, cibleDate: moinsJours(agISO, DELAIS_CABINET.DEVIS_JOURS), source: "cabinet" },
    {
      code: "CONVOC",
      libelle: LIBELLES.CONVOC,
      cibleDate: convocCible,
      dateLegale: convocLegale,
      dateCabinet: convocCabinet,
      source: convocCible === convocLegale ? "legal" : "cabinet",
    },
    { code: "POUVOIRS", libelle: LIBELLES.POUVOIRS, cibleDate: moinsJours(agISO, DELAIS_CABINET.POUVOIRS_JOURS), source: "cabinet" },
    { code: "TENUE", libelle: LIBELLES.TENUE, cibleDate: agISO, source: "legal" },
  ];
}
