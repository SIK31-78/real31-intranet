// Service : marque un jalon (etat). Passe par le routeur, jamais un adapter en
// direct (ADR-001).

import type { MarquageJalon } from "@/lib/ports/jalon-repository";
import { getJalonRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

export async function marquerJalon(input: MarquageJalon, managerId: string): Promise<void> {
  await exigerPerimetre(input.coproCode, managerId);
  return getJalonRepository().marquer(input);
}
