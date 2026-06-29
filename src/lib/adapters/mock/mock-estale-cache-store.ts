// Adapter mock du cache eStale : no-op (toujours "miss" -> appel eStale live). Pour le
// dev sans Supabase ; le cache reel n'a de sens qu'avec la table native.

import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { EstaleCacheStore } from "@/lib/ports/estale-cache-store";

export class MockEstaleCacheStore implements EstaleCacheStore {
  async lire(): Promise<DonneesEstaleCopro | null> {
    return null;
  }
  async ecrire(): Promise<void> {}
  async invalider(): Promise<void> {}
}
