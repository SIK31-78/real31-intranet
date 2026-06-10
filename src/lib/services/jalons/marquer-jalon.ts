// Service : marque un jalon (etat). Passe par le routeur, jamais un adapter en
// direct (ADR-001).

import type { MarquageJalon } from "@/lib/ports/jalon-repository";
import { getJalonRepository } from "@/lib/adapters/router";

export async function marquerJalon(input: MarquageJalon): Promise<void> {
  return getJalonRepository().marquer(input);
}
