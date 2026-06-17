// Service : l'AG eStale d'une copro (palier 1, lecture). Passe par le routeur
// (ADR-001). Degrade proprement : null si pas d'AG ou si eStale tombe.

import type { AssembleeAg, OrdreMotion, ResolutionLibre } from "@/lib/domain/assemblee";
import { getAssembleeEstaleProvider } from "@/lib/adapters/router";

export async function getAssemblee(coproCode: string): Promise<AssembleeAg | null> {
  try {
    return await getAssembleeEstaleProvider().getAssemblee(coproCode);
  } catch (err) {
    console.warn(`[assemblee] eStale indisponible pour ${coproCode} :`, (err as Error).message);
    return null;
  }
}

/** Reconcilie l'AG eStale avec la composition du mode CS (palier 2b). Ecriture reelle. */
export async function appliquerOdjAg(
  meetingId: string,
  supprimerMotionIds: string[],
  bankItemIds: string[],
  libres: ResolutionLibre[],
  ordre: OrdreMotion[],
): Promise<{ supprimees: number; ajoutees: number }> {
  return getAssembleeEstaleProvider().appliquerOdj(
    meetingId,
    supprimerMotionIds,
    bankItemIds,
    libres,
    ordre,
  );
}

/** Cree une nouvelle AG ordinaire dans eStale pour la copro (palier 3). Ecriture reelle. */
export async function creerAssembleeAg(coproCode: string): Promise<string> {
  return getAssembleeEstaleProvider().creerAssemblee(coproCode);
}
