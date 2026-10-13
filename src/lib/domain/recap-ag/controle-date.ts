// Un recap d'AG est rattache a UNE assemblee (decision Sekou, 12/10/2026, REA-166).
//
// L'INCIDENT. La page pre-remplissait la date du recap avec la DERNIERE AG tenue quand la
// prochaine n'etait pas planifiee : celle de l'an dernier. Deux gestionnaires ont corrige
// le jour mais pas l'annee -> recaps 2026 enregistres en 2025, doublons apparents, facture
// de depassement au bareme d'il y a deux ans. Deux gardes, ici, en domaine pur :
//  - ne plus SUGGERER une AG deja couverte par un recap (ni une AG trop ancienne) ;
//  - a l'enregistrement, faire CONFIRMER une date suspecte : un autre recap de la meme
//    copro a moins de 10 mois, ou une AG tenue il y a plus de 6 mois.
// La meme date exacte reste refusee sans appel (cle unique copro + date en base).
//
// Aucune I/O : la date du jour est toujours passee en parametre.

import { TOLERANCE_RAPPROCHEMENT_JOURS } from "./retard";

/** En dessous de cet ecart, deux recaps de la meme copro sont suspects (une AG par an). */
export const ECART_MIN_ENTRE_RECAPS_MOIS = 10;
/** Au-dela de cette anciennete, la date d'AG saisie est suspecte (faute d'annee). */
export const ANCIENNETE_SUSPECTE_MOIS = 6;

function versUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** iso + n mois, jour borne a la fin du mois (31/08 + 6 mois = 28/02). Rend un ISO jour. */
export function ajouterMois(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const cible = new Date(Date.UTC(y, m - 1 + n, 1));
  const dernierJour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(d, dernierJour));
  return cible.toISOString().slice(0, 10);
}

function joursEntre(aISO: string, bISO: string): number {
  return Math.abs(versUtc(bISO) - versUtc(aISO)) / 86_400_000;
}

/** Deux dates sont-elles a moins de `mois` mois l'une de l'autre (dans un sens ou l'autre) ? */
function aMoinsDe(aISO: string, bISO: string, mois: number): boolean {
  const [avant, apres] = aISO <= bISO ? [aISO, bISO] : [bISO, aISO];
  return ajouterMois(avant, mois) > apres.slice(0, 10);
}

function jourFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * La date de recap a proposer pour une copro, ou `undefined` (champ laisse vide).
 * Candidate : la prochaine AG si elle est passee (ou du jour), sinon la derniere tenue.
 * Ecartee si un recap la couvre deja (meme tolerance que le suivi des retards : la date du
 * referentiel et la tenue reelle divergent de quelques jours), ou si elle a plus de
 * 6 mois : c'est exactement le piege de l'an dernier.
 */
export function dateRecapSuggeree(params: {
  prochaineAgDate?: string;
  derniereAgDate?: string;
  /** Dates d'AG des recaps deja saisis pour cette copro. */
  datesRecaps: readonly string[];
  aujourdhui: string;
}): { date: string; origine: "prochaine" | "derniere" } | undefined {
  const { prochaineAgDate, derniereAgDate, datesRecaps, aujourdhui } = params;
  const prochaine = prochaineAgDate?.slice(0, 10);
  const candidate =
    prochaine && prochaine <= aujourdhui
      ? { date: prochaine, origine: "prochaine" as const }
      : derniereAgDate
        ? { date: derniereAgDate.slice(0, 10), origine: "derniere" as const }
        : undefined;
  if (!candidate) return undefined;
  if (datesRecaps.some((d) => joursEntre(d, candidate.date) <= TOLERANCE_RAPPROCHEMENT_JOURS)) return undefined;
  if (ajouterMois(candidate.date, ANCIENNETE_SUSPECTE_MOIS) < aujourdhui) return undefined;
  return candidate;
}

export type MotifControleDate = "meme_date" | "recap_proche" | "ag_ancienne";

export interface AlerteDateRecap {
  motif: MotifControleDate;
  /** `meme_date` ne se confirme pas : une AG = un recap. */
  confirmable: boolean;
  message: string;
}

/**
 * Les alertes sur la date d'AG d'un recap a enregistrer. Vide = rien a signaler.
 * Un `meme_date` bloque ; les autres demandent une confirmation explicite.
 */
export function controlerDateRecap(params: {
  agDate: string;
  /** Dates d'AG des recaps deja saisis pour cette copro. */
  datesRecaps: readonly string[];
  aujourdhui: string;
}): AlerteDateRecap[] {
  const agDate = params.agDate.slice(0, 10);
  const alertes: AlerteDateRecap[] = [];
  const dates = params.datesRecaps.map((d) => d.slice(0, 10));

  if (dates.includes(agDate)) {
    alertes.push({
      motif: "meme_date",
      confirmable: false,
      message: `Un récap existe déjà pour l'AG du ${jourFr(agDate)} : une assemblée n'a qu'un récap.`,
    });
    return alertes;
  }

  const proches = dates.filter((d) => aMoinsDe(d, agDate, ECART_MIN_ENTRE_RECAPS_MOIS)).sort();
  if (proches.length > 0) {
    alertes.push({
      motif: "recap_proche",
      confirmable: true,
      message:
        `Un récap existe déjà pour l'AG du ${proches.map(jourFr).join(", ")}, à moins de ${ECART_MIN_ENTRE_RECAPS_MOIS} mois ` +
        `de celle du ${jourFr(agDate)}. Vérifiez l'année : s'agit-il bien d'une autre assemblée ?`,
    });
  }

  if (ajouterMois(agDate, ANCIENNETE_SUSPECTE_MOIS) < params.aujourdhui) {
    alertes.push({
      motif: "ag_ancienne",
      confirmable: true,
      message:
        `L'AG du ${jourFr(agDate)} date de plus de ${ANCIENNETE_SUSPECTE_MOIS} mois. ` +
        `Vérifiez l'année : le dépassement serait facturé au barème de l'exercice ${Number(agDate.slice(0, 4)) - 1}.`,
    });
  }
  return alertes;
}

/**
 * Le refus a opposer a l'enregistrement, ou null. `dateConfirmee` = le gestionnaire a vu
 * les alertes confirmables et maintenu sa date.
 */
export function refusDateRecap(alertes: readonly AlerteDateRecap[], dateConfirmee: boolean): string | null {
  const bloquante = alertes.find((a) => !a.confirmable);
  if (bloquante) return bloquante.message;
  const aConfirmer = alertes.filter((a) => a.confirmable);
  if (aConfirmer.length === 0 || dateConfirmee) return null;
  return `${aConfirmer.map((a) => a.message).join(" ")} Confirmez la date pour enregistrer quand même.`;
}
