// Mock en memoire du dossier de perte (mode COPRO_SOURCE absent).

import type { PerteRepository } from "@/lib/ports/perte-repository";
import type { DossierPerte } from "@/lib/domain/perte/dossier";

const DOSSIERS: DossierPerte[] = [];

export class MockPerteRepository implements PerteRepository {
  async lister(): Promise<DossierPerte[]> {
    return [...DOSSIERS].sort((a, b) => b.dateAgISO.localeCompare(a.dateAgISO));
  }

  async get(id: string): Promise<DossierPerte | null> {
    return DOSSIERS.find((d) => d.id === id) ?? null;
  }

  async getEnCoursPourCopro(coproCode: string): Promise<DossierPerte | null> {
    return DOSSIERS.find((d) => d.coproCode === coproCode && d.statut === "en_cours") ?? null;
  }

  async creer(d: Omit<DossierPerte, "id">): Promise<DossierPerte> {
    if (DOSSIERS.some((x) => x.coproCode === d.coproCode && x.dateAgISO === d.dateAgISO)) {
      throw new Error(`Un dossier de perte existe déjà pour ${d.coproCode} et l'AG du ${d.dateAgISO}.`);
    }
    const dossier = { ...d, id: `perte-mock-${DOSSIERS.length + 1}` };
    DOSSIERS.push(dossier);
    return dossier;
  }

  async sauver(d: DossierPerte): Promise<void> {
    const i = DOSSIERS.findIndex((x) => x.id === d.id);
    if (i >= 0) DOSSIERS[i] = d;
  }
}
