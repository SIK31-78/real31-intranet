// Adapter mock de la confirmation des dates AG/CS : etat en memoire (module-level),
// suffisant pour le dev / la demo. Cle CODE__TYPE, comme la table (pk copro_code, type).

import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import type { ConfirmationEvenementRepository } from "@/lib/ports/confirmation-evenement-repository";

const STORE = new Map<string, ConfirmationEvenement>();

function cle(coproCode: string, type: "AG" | "CS"): string {
  return `${coproCode}__${type}`;
}

export class MockConfirmationEvenementRepository implements ConfirmationEvenementRepository {
  async getPourCopros(codes: string[]): Promise<ConfirmationEvenement[]> {
    const voulus = new Set(codes);
    return [...STORE.values()].filter((c) => voulus.has(c.coproCode));
  }

  async get(coproCode: string): Promise<ConfirmationEvenement[]> {
    return [...STORE.values()].filter((c) => c.coproCode === coproCode);
  }

  async confirmer(coproCode: string, type: "AG" | "CS", date: string, par: string): Promise<void> {
    STORE.set(cle(coproCode, type), {
      coproCode,
      type,
      date,
      statut: "confirme",
      confirmeLe: new Date().toISOString(),
      confirmePar: par,
    });
  }

  async proposer(coproCode: string, type: "AG" | "CS", date: string): Promise<void> {
    STORE.set(cle(coproCode, type), { coproCode, type, date, statut: "a_confirmer" });
  }
}
