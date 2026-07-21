// Adapter mock des dates AG/CS des copros eStale : store module en memoire. Sert offline
// (COPRO_SOURCE != supabase) et dans les tests. Vide au demarrage : les copros eStale
// mockees s'appuient sur le repli miroir tant qu'aucune date n'est posee.

import type { CoproDatesRepository } from "@/lib/ports/copro-dates-repository";
import { datesDepuisTimestamps, type CoproDates } from "@/lib/domain/copro-fusion";

type Row = {
  next_ag_date: string | null;
  next_cs_date: string | null;
  last_ag_date: string | null;
  last_cs_date: string | null;
};

const STORE = new Map<string, Row>();

const COLONNES = {
  ag: { prochaine: "next_ag_date", derniere: "last_ag_date" },
  cs: { prochaine: "next_cs_date", derniere: "last_cs_date" },
} as const;

export class MockCoproDatesRepository implements CoproDatesRepository {
  async lire(code: string): Promise<CoproDates | null> {
    const row = STORE.get(code);
    return row ? datesDepuisTimestamps(row) : null;
  }

  async lireToutes(): Promise<Map<string, CoproDates>> {
    return new Map([...STORE.entries()].map(([code, row]) => [code, datesDepuisTimestamps(row)]));
  }

  async ecrire(
    code: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
  ): Promise<void> {
    const row = STORE.get(code) ?? { next_ag_date: null, next_cs_date: null, last_ag_date: null, last_cs_date: null };
    row[COLONNES[type][quand]] = dateISO;
    STORE.set(code, row);
  }
}

/** Vide le store (tests). */
export function _resetMockCoproDates(): void {
  STORE.clear();
}
