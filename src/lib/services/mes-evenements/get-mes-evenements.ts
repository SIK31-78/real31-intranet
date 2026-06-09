// Service de l'ecran "Mes evenements" : passe par le routeur, jamais un adapter en
// direct (ADR-001).

import type { MesEvenements } from "@/lib/domain/mes-evenements";
import { getMesEvenementsProvider } from "@/lib/adapters/router";

export async function getMesEvenements(gestionnaireId: string): Promise<MesEvenements> {
  return getMesEvenementsProvider().getMesEvenements(gestionnaireId);
}
