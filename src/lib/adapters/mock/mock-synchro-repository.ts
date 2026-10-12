// Doublure en memoire du compte rendu des synchros (dev sans base, tests).

import type { EtatSynchro } from "@/lib/domain/synchro";
import type { SynchroRepository } from "@/lib/ports/synchro-repository";

export class MockSynchroRepository implements SynchroRepository {
  constructor(private readonly etats: Record<string, EtatSynchro> = {}) {}

  async etat(cle: string): Promise<EtatSynchro | null> {
    return this.etats[cle] ?? null;
  }
}
