// Adapter mock des gestionnaires.

import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

// Ids d'agence mockes (coherents avec le mock du lecteur Agency : agence-lgc = LGC, etc.).
// Servent a demontrer le cloisonnement par agence offline.
const GESTIONNAIRES: Gestionnaire[] = [
  { id: "el", nomComplet: "Élise Lambert", initiales: "EL", email: "e.lambert@real31.fr", agencyId: "agence-lgc" },
  { id: "fa", nomComplet: "Farid Amrani", initiales: "FA", email: "f.amrani@real31.fr", agencyId: "agence-ml" },
];

// Comptable "pur" (transverse, sans portefeuille) : absent de list(), present seulement
// dans listImpersonables() pour que le dev offline ait un comptable a incarner.
const COMPTABLES: Gestionnaire[] = [
  { id: "eg", nomComplet: "Elsa Garnier", initiales: "EG", email: "e.garnier@real31.fr", role: "COMPTABLE", agencyId: "agence-hls" },
];

export class MockGestionnaireRepository implements GestionnaireRepository {
  async list(): Promise<Gestionnaire[]> {
    return GESTIONNAIRES;
  }

  async listImpersonables(): Promise<Gestionnaire[]> {
    return [...GESTIONNAIRES, ...COMPTABLES].sort((a, b) =>
      a.nomComplet.localeCompare(b.nomComplet),
    );
  }
  async findById(id: string): Promise<Gestionnaire | null> {
    // Cherche aussi parmi les comptables : le cookie gid peut incarner Elsa (listImpersonables).
    return [...GESTIONNAIRES, ...COMPTABLES].find((g) => g.id === id) ?? null;
  }

  // Pas d'email en mock (le SSO suppose le mode supabase) -> premier gestionnaire.
  async findByEmail(): Promise<Gestionnaire | null> {
    return GESTIONNAIRES[0] ?? null;
  }
}
