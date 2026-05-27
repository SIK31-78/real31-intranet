// Service applicatif du calendrier : passe par le routeur, jamais un adapter en direct.

import type { Evenement } from "@/lib/domain/calendrier";
import { getCalendrierProvider } from "@/lib/adapters/router";

export async function getEvenements(gestionnaireId: string): Promise<Evenement[]> {
  const provider = getCalendrierProvider();
  return provider.getEvenements(gestionnaireId);
}
