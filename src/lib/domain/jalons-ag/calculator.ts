// Calculateur des jalons d'une AG (ADR-006). Pur, deterministe (UTC).
// Cible = la date la plus contraignante entre le legal et le defaut cabinet.

import { DELAIS_LEGAUX } from "./legal/delais";
import { DELAIS_CABINET } from "./cabinet/real31-defaults";
import { joursFeries } from "./jours-feries";
import type { JalonCalcule, JalonCode } from "./types";
import type { Jalon } from "../commun";

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
function plusJours(isoDate: string, n: number): string {
  const d = parseISO(isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
function joursEntre(aISO: string, bISO: string): number {
  return (parseISO(bISO).getTime() - parseISO(aISO).getTime()) / 86_400_000;
}
function estChomme(d: Date, feries: Set<string>): boolean {
  const jour = d.getUTCDay(); // 0 = dimanche, 6 = samedi
  return jour === 0 || jour === 6 || feries.has(toISO(d));
}

/** Recule une date au jour ouvre precedent si elle tombe un week-end / ferie
 *  (envoyer/mettre sous pli plus tot reste valide). Exporte : les creneaux
 *  Outlook derives de l'AG (cf. ./creneaux) doivent tomber un jour travaille. */
export function reculerJourOuvre(iso: string): string {
  const d = parseISO(iso);
  let feries = joursFeries(d.getUTCFullYear());
  while (estChomme(d, feries)) {
    d.setUTCDate(d.getUTCDate() - 1);
    feries = joursFeries(d.getUTCFullYear()); // au cas ou on recule sur l'annee precedente
  }
  return toISO(d);
}

/** Date limite d'envoi de la convocation : 21 jours francs avant l'AG.
 *  Jours francs = ni le jour d'envoi ni le jour de l'AG ne comptent, d'ou
 *  AG - (21 + 1) jours calendaires, recule au jour ouvre precedent si chomme. */
function dateConvocationLegale(agISO: string): string {
  return reculerJourOuvre(moinsJours(agISO, DELAIS_LEGAUX.CONVOCATION_AG_JOURS_FRANCS + 1));
}

const LIBELLES: Record<JalonCode, string> = {
  ODJ_CS: "ODJ validé avec le Conseil Syndical",
  DEVIS: "Devis et documents techniques rassemblés",
  // "Mise sous pli" EST l'envoi des convocations (meme acte, mot du cabinet) : le
  // marqueur legal n'est pas perdu, cocher ce jalon vaut "convocations parties".
  CONVOC: "Mise sous pli",
  RELANCE_POUVOIRS: "Relance date AG",
  POUVOIRS: "Pouvoirs et votes par correspondance reçus",
  TENUE: "Tenue de l'AG",
  SCAN_CONTRAT: "Scan du contrat + événement Crypto",
  NOTIF_PV: "Notification du PV",
  ARCHIVAGE: "Archivage du dossier AG",
};

/** Calcule les 9 jalons d'une AG a partir de sa date (ISO "YYYY-MM-DD") :
 *  6 avant la tenue (ODJ -> tenue) + 3 apres (scan contrat, notif PV, archivage). */
export function calculerJalons(agISO: string): JalonCalcule[] {
  const convocLegale = dateConvocationLegale(agISO);
  const convocCabinet = moinsJours(agISO, DELAIS_CABINET.CONVOC_JOURS);
  // La plus contraignante = la plus tot = la plus petite date ISO, reculee au
  // jour ouvre precedent (mise sous pli un jour ouvre, pas un week-end / ferie).
  const convocCible = reculerJourOuvre(convocLegale <= convocCabinet ? convocLegale : convocCabinet);

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
    { code: "RELANCE_POUVOIRS", libelle: LIBELLES.RELANCE_POUVOIRS, cibleDate: moinsJours(agISO, DELAIS_CABINET.RELANCE_POUVOIRS_JOURS), source: "cabinet" },
    { code: "POUVOIRS", libelle: LIBELLES.POUVOIRS, cibleDate: moinsJours(agISO, DELAIS_CABINET.POUVOIRS_JOURS), source: "cabinet" },
    { code: "TENUE", libelle: LIBELLES.TENUE, cibleDate: agISO, source: "legal" },
    { code: "SCAN_CONTRAT", libelle: LIBELLES.SCAN_CONTRAT, cibleDate: plusJours(agISO, DELAIS_CABINET.SCAN_CONTRAT_JOURS), source: "cabinet" },
    { code: "NOTIF_PV", libelle: LIBELLES.NOTIF_PV, cibleDate: plusJours(agISO, DELAIS_CABINET.NOTIF_PV_JOURS), source: "cabinet" },
    { code: "ARCHIVAGE", libelle: LIBELLES.ARCHIVAGE, cibleDate: plusJours(agISO, DELAIS_CABINET.ARCHIVAGE_JOURS), source: "cabinet" },
  ];
}

/** Pastille de compte a rebours vers une date cible (label J-x / +x j + severite).
 *  Severite : retard si la cible est passee, proche a 7 jours ou moins, sinon ok. */
export function compteARebours(cibleISO: string, aujourdhuiISO: string): Jalon {
  const jours = joursEntre(aujourdhuiISO, cibleISO);
  if (jours < 0) return { label: `+${-jours} j`, severite: "late" };
  return { label: `J-${jours}`, severite: jours <= 7 ? "soon" : "ok" };
}

/** Jalon "courant" d'une AG : compte a rebours vers le prochain jalon a echeance
 *  (le premier dont la cible n'est pas passee ; a defaut la tenue). Sans etat des
 *  jalons (pas encore en base), on se base uniquement sur les dates. */
export function jalonCourantAg(agISO: string, aujourdhuiISO: string): Jalon {
  const tries = [...calculerJalons(agISO)].sort((a, b) =>
    a.cibleDate.localeCompare(b.cibleDate),
  );
  const prochain = tries.find((j) => j.cibleDate >= aujourdhuiISO) ?? tries[tries.length - 1];
  return compteARebours(prochain.cibleDate, aujourdhuiISO);
}
