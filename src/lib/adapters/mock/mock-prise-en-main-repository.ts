// Adapter mock de la prise en main : feature inerte hors mode supabase (getConfirmees
// renvoie null -> tout considere pris en main). Les ecritures sont des no-op.

import type { PriseEnMainRepository } from "@/lib/ports/prise-en-main-repository";

export class MockPriseEnMainRepository implements PriseEnMainRepository {
  async getConfirmees(): Promise<Set<string> | null> {
    return null;
  }
  async confirmer(): Promise<void> {}
  async annuler(): Promise<void> {}
}
