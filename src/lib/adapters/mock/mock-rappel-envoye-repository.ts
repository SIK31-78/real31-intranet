// Adapter mock de la trace des rappels envoyes : store module-level en memoire (dev hors
// supabase). Meme semantique que la table : une cle reservee ne se reserve plus.

import type { RappelEnvoyeRepository } from "@/lib/ports/rappel-envoye-repository";

const CLES = new Set<string>();

export class MockRappelEnvoyeRepository implements RappelEnvoyeRepository {
  async reserver(cle: string): Promise<boolean> {
    if (CLES.has(cle)) return false;
    CLES.add(cle);
    return true;
  }
  async liberer(cle: string): Promise<void> {
    CLES.delete(cle);
  }
}
