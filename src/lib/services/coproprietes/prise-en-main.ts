// Service : prise en main des copros (onboarding). Passe par le routeur (ADR-001).

import { getPriseEnMainRepository } from "@/lib/adapters/router";

/** Codes confirmes parmi `codes`. null = feature inerte (table absente). */
export async function getPrisesEnMain(codes: string[]): Promise<Set<string> | null> {
  return getPriseEnMainRepository().getConfirmees(codes);
}

export async function confirmerPriseEnMain(coproCode: string, par: string): Promise<void> {
  return getPriseEnMainRepository().confirmer(coproCode, par);
}

export async function annulerPriseEnMain(coproCode: string): Promise<void> {
  return getPriseEnMainRepository().annuler(coproCode);
}
