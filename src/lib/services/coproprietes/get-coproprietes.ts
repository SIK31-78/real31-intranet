// Service de la liste des coproprietes : passe par le routeur, jamais un adapter
// en direct (ADR-001).

import type { Copropriete } from "@/lib/domain/copropriete";
import { getCoproRepository } from "@/lib/adapters/router";

export async function getCoproprietes(managerId?: string): Promise<Copropriete[]> {
  return getCoproRepository().list(managerId);
}
