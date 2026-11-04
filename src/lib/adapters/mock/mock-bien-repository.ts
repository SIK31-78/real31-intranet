// Mock en memoire des biens hors syndic (COPRO_SOURCE absent, et tests de service).

import { messageReferenceBienExiste, type BienHorsSyndic, type NouveauBien } from "@/lib/domain/bien";
import type { BienRepository } from "@/lib/ports/bien-repository";

export class MockBienRepository implements BienRepository {
  biens: BienHorsSyndic[] = [];
  /** Qui a cree quoi (cree_par), pour les tests. */
  creesPar = new Map<string, string>();

  async lister(f: { agenceCode?: string; inclureInactifs?: boolean } = {}): Promise<BienHorsSyndic[]> {
    return this.biens
      .filter((b) => !f.agenceCode || b.agenceCode === f.agenceCode.toUpperCase())
      .filter((b) => f.inclureInactifs || b.actif)
      .sort((a, b) => a.reference.localeCompare(b.reference));
  }

  async creer(agenceCode: string, bien: NouveauBien, creePar: string): Promise<BienHorsSyndic> {
    const agence = agenceCode.toUpperCase();
    if (this.biens.some((b) => b.agenceCode.toUpperCase() === agence && b.reference.toUpperCase() === bien.reference.toUpperCase())) {
      throw new Error(messageReferenceBienExiste(bien.reference, agence));
    }
    const cree: BienHorsSyndic = {
      id: crypto.randomUUID(),
      agenceCode: agence,
      activite: bien.activite,
      reference: bien.reference,
      type: bien.type,
      libelle: "",
      adresse: bien.adresse,
      proprietaire: bien.proprietaire,
      ...(bien.note ? { note: bien.note } : {}),
      actif: true,
      source: "intranet",
    };
    this.creesPar.set(cree.id, creePar);
    this.biens.push(cree);
    return cree;
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
