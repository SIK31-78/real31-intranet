// Mock en memoire des biens hors syndic (COPRO_SOURCE absent, et tests de service).

import type { BienHorsSyndic } from "@/lib/domain/bien";
import type { BienRepository } from "@/lib/ports/bien-repository";

export class MockBienRepository implements BienRepository {
  biens: BienHorsSyndic[] = [];

  async lister(f: { agenceCode?: string; inclureInactifs?: boolean } = {}): Promise<BienHorsSyndic[]> {
    return this.biens
      .filter((b) => !f.agenceCode || b.agenceCode === f.agenceCode.toUpperCase())
      .filter((b) => f.inclureInactifs || b.actif)
      .sort((a, b) => a.reference.localeCompare(b.reference));
  }

  async get(id: string): Promise<BienHorsSyndic | null> {
    return this.biens.find((b) => b.id === id) ?? null;
  }
}

let instance: MockBienRepository | null = null;
export function mockBiens(): MockBienRepository {
  instance ??= new MockBienRepository();
  return instance;
}
