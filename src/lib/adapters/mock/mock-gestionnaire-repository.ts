// Adapter mock des gestionnaires.

import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const GESTIONNAIRES: Gestionnaire[] = [
  { id: "el", nomComplet: "Élise Lambert", initiales: "EL" },
  { id: "fa", nomComplet: "Farid Amrani", initiales: "FA" },
];

export class MockGestionnaireRepository implements GestionnaireRepository {
  async list(): Promise<Gestionnaire[]> {
    return GESTIONNAIRES;
  }
  async findById(id: string): Promise<Gestionnaire | null> {
    return GESTIONNAIRES.find((g) => g.id === id) ?? null;
  }
}
