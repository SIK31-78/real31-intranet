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
      ...projection(coproCode, type), // la projection Outlook survit (comme l'upsert SQL)
      coproCode,
      type,
      date,
      statut: "confirme",
      confirmeLe: new Date().toISOString(),
      confirmePar: par,
    });
  }

  async proposer(coproCode: string, type: "AG" | "CS", date: string): Promise<void> {
    STORE.set(cle(coproCode, type), {
      ...projection(coproCode, type), // idem : replanifier ne perd pas l'evenement projete
      coproCode,
      type,
      date,
      statut: "a_confirmer",
    });
  }

  async enregistrerProjection(
    coproCode: string,
    type: "AG" | "CS",
    eventId: string | null,
    boite: string | null,
  ): Promise<void> {
    const existante = STORE.get(cle(coproCode, type));
    if (!existante) return; // pas de ligne de confirmation -> pas de projection (comme le SQL)
    const maj = { ...existante };
    delete maj.outlookEventId;
    delete maj.outlookBoite;
    if (eventId && boite) {
      maj.outlookEventId = eventId;
      maj.outlookBoite = boite;
    }
    STORE.set(cle(coproCode, type), maj);
  }
}

/** Champs de projection Outlook de l'entree existante (a reporter dans l'upsert). */
function projection(
  coproCode: string,
  type: "AG" | "CS",
): Pick<ConfirmationEvenement, "outlookEventId" | "outlookBoite"> {
  const c = STORE.get(cle(coproCode, type));
  return {
    ...(c?.outlookEventId ? { outlookEventId: c.outlookEventId } : {}),
    ...(c?.outlookBoite ? { outlookBoite: c.outlookBoite } : {}),
  };
}
