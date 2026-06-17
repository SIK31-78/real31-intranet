// Service : l'AG eStale d'une copro (palier 1, lecture). Passe par le routeur
// (ADR-001). Degrade proprement : null si pas d'AG ou si eStale tombe.

import type { AssembleeAg } from "@/lib/domain/assemblee";
import { getAssembleeEstaleProvider } from "@/lib/adapters/router";

export async function getAssemblee(coproCode: string): Promise<AssembleeAg | null> {
  try {
    return await getAssembleeEstaleProvider().getAssemblee(coproCode);
  } catch (err) {
    console.warn(`[assemblee] eStale indisponible pour ${coproCode} :`, (err as Error).message);
    return null;
  }
}
