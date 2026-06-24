// Echeances reglementaires affichees en colonne sur la supervision AG (fusion B4).
// On ne DUPLIQUE pas l'etat des jalons : on calcule, pour les items de la checklist
// qui portent une echeance legale/cabinet, la date cible + le compte a rebours, a
// partir du moteur jalons existant (lib/domain/jalons-ag). Lecture seule.

import { calculerJalons, compteARebours } from "./jalons-ag/calculator";
import type { JalonCode } from "./jalons-ag/types";

// Quels items de la checklist de supervision portent un jalon reglementaire.
// (Seuls ceux qui ont une echeance datee claire ; les autres n'affichent rien.)
export const ITEM_ECHEANCE: Record<string, JalonCode> = {
  "conv.date": "CONVOC", // convocation = 21 jours francs (legal) / J-30 (cabinet)
  "conv.rappel-pouvoirs": "RELANCE_POUVOIRS", // relance pouvoirs J-8
  "apag.scan-contrat": "SCAN_CONTRAT", // scan contrat J+2
  "apag.notif-pv-date": "NOTIF_PV", // notification du PV J+30
};

export interface EcheanceItem {
  /** Date cible, ISO "YYYY-MM-DD". */
  dateISO: string;
  /** Compte a rebours : "J-21" / "+3 j". */
  label: string;
  /** ok (loin), soon (<=7 j), late (depassee). */
  severite: "ok" | "soon" | "late";
}

/** Echeance reglementaire d'un item de supervision, ou null si l'item n'en porte pas
 *  (ou si l'AG n'a pas de date). agDateISO = "YYYY-MM-DD". */
export function echeanceItem(
  itemId: string,
  agDateISO: string | null,
  aujourdhuiISO: string,
): EcheanceItem | null {
  const code = ITEM_ECHEANCE[itemId];
  if (!code || !agDateISO) return null;
  const jalon = calculerJalons(agDateISO).find((j) => j.code === code);
  if (!jalon) return null;
  const cr = compteARebours(jalon.cibleDate, aujourdhuiISO);
  return { dateISO: jalon.cibleDate, label: cr.label, severite: cr.severite };
}
