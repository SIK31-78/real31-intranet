// Les seuils de relance du module « Contrats & contrôles » (plan §3 point 26, décision 10) :
// la table ReminderRule reste, l'écran /admin/relances la modifie, réservé à la direction (la
// garde de rôle est dans la page et l'action, jamais ici : un service n'importe pas l'auth).
//
// Une règle par sujet : la fenêtre (premier rappel, en jours avant l'échéance), les seuils
// orange et rouge (jours sans étape franchie), la cadence des mails. Les bornes sont larges
// mais fermes : un rouge avant l'orange ou une cadence de 0 jour casserait le calcul du niveau
// et la clé d'idempotence des rappels (cf. domaine qualification.ts et relances.ts).

import { getContratsCoproRepository } from "@/lib/adapters/router";
import { SUJETS, type RegleRelance, type SujetSuivi } from "@/lib/domain/contrats-copro";
import type { AuteurContrats } from "./types";

export const BORNES_REGLE = {
  premierRappelJours: { min: 1, max: 730 },
  orangeJours: { min: 1, max: 365 },
  /** Le rouge doit dépasser l'orange : sa borne basse réelle est orangeJours + 1. */
  rougeJours: { min: 2, max: 730 },
  cadenceJours: { min: 1, max: 90 },
} as const;

function entierEntre(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** Le refus métier d'une règle, en français ; null si elle est acceptable. Pure. */
export function verifierRegle(r: RegleRelance): string | null {
  if (!(SUJETS as readonly string[]).includes(r.sujet)) return "Sujet de suivi inconnu.";
  const b = BORNES_REGLE;
  if (!entierEntre(r.premierRappelJours, b.premierRappelJours.min, b.premierRappelJours.max)) {
    return `Le premier rappel se compte en jours entiers, de ${b.premierRappelJours.min} à ${b.premierRappelJours.max} avant l'échéance.`;
  }
  if (!entierEntre(r.orangeJours, b.orangeJours.min, b.orangeJours.max)) {
    return `Le seuil orange se compte en jours entiers, de ${b.orangeJours.min} à ${b.orangeJours.max}.`;
  }
  if (!entierEntre(r.rougeJours, b.rougeJours.min, b.rougeJours.max)) {
    return `Le seuil rouge se compte en jours entiers, de ${b.rougeJours.min} à ${b.rougeJours.max}.`;
  }
  if (r.rougeJours <= r.orangeJours) return "Le seuil rouge doit être strictement supérieur au seuil orange.";
  if (!entierEntre(r.cadenceJours, b.cadenceJours.min, b.cadenceJours.max)) {
    return `La cadence des rappels se compte en jours entiers, de ${b.cadenceJours.min} à ${b.cadenceJours.max}.`;
  }
  return null;
}

/** Les 4 règles en vigueur (valeurs par défaut si la table manque, cf. port). */
export async function listerRegles(): Promise<Record<SujetSuivi, RegleRelance>> {
  return getContratsCoproRepository().listerReglesRelance();
}

/**
 * Remplace la règle d'un sujet. Le niveau de chaque cycle et les clés de rappel se recalculent
 * à la prochaine lecture : rien n'est stocké. Le changement est tracé dans les logs serveur
 * (il n'y a pas de copro à qui rattacher une entrée de journal).
 */
export async function modifierRegle(r: RegleRelance, auteur: AuteurContrats): Promise<void> {
  const refus = verifierRegle(r);
  if (refus) throw new Error(refus);
  const regle: RegleRelance = {
    sujet: r.sujet,
    premierRappelJours: r.premierRappelJours,
    orangeJours: r.orangeJours,
    rougeJours: r.rougeJours,
    cadenceJours: r.cadenceJours,
  };
  await getContratsCoproRepository().sauverRegleRelance(regle);
  console.info(
    `[contrats-copro] règle ${regle.sujet} modifiée par ${auteur.nom} (${auteur.id}) : fenêtre ${regle.premierRappelJours} j, orange ${regle.orangeJours} j, rouge ${regle.rougeJours} j, cadence ${regle.cadenceJours} j`,
  );
}
