// Service : les cles de repartition d'une copro, proposees a la saisie des travaux votes
// du recap AG (remontee 3912b603). Passe par le routeur (ADR-001).
//
// Simple SUGGESTION : la saisie libre reste toujours possible. Estale indisponible ou
// copro hors Estale -> [] (jamais d'erreur), le champ redevient un texte libre.

import type { CleRepartition } from "@/lib/domain/assemblee";
import { getAssembleeEstaleProvider } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

export async function listerClesRepartition(coproCode: string, managerId: string): Promise<CleRepartition[]> {
  await exigerPerimetre(coproCode, managerId);
  try {
    return await getAssembleeEstaleProvider().listerClesRepartition(coproCode);
  } catch (err) {
    console.warn(`[recap-ag] clés de répartition ESTALE indisponibles pour ${coproCode} :`, (err as Error).message);
    return [];
  }
}
