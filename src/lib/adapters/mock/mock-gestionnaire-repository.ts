// Adapter mock des gestionnaires.

import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const GESTIONNAIRES: Gestionnaire[] = [
  { id: "el", nomComplet: "Élise Lambert", initiales: "EL", email: "e.lambert@real31.fr" },
  { id: "fa", nomComplet: "Farid Amrani", initiales: "FA", email: "f.amrani@real31.fr" },
];

export class MockGestionnaireRepository implements GestionnaireRepository {
  async list(): Promise<Gestionnaire[]> {
    return GESTIONNAIRES;
  }
  async findById(id: string): Promise<Gestionnaire | null> {
    return GESTIONNAIRES.find((g) => g.id === id) ?? null;
  }

  // Pas d'email en mock (le SSO suppose le mode supabase) -> premier gestionnaire.
  async findByEmail(): Promise<Gestionnaire | null> {
    return GESTIONNAIRES[0] ?? null;
  }
}
