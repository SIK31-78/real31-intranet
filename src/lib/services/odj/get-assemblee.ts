// Service : l'AG Estale d'une copro (palier 1, lecture). Passe par le routeur
// (ADR-001). Degrade proprement : null si pas d'AG ou si Estale tombe.

import type { AssembleeAg, ResolutionLibre } from "@/lib/domain/assemblee";
import { getAssembleeEstaleProvider } from "@/lib/adapters/router";

export async function getAssemblee(coproCode: string): Promise<AssembleeAg | null> {
  try {
    return await getAssembleeEstaleProvider().getAssemblee(coproCode);
  } catch (err) {
    console.warn(`[assemblee] Estale indisponible pour ${coproCode} :`, (err as Error).message);
    return null;
  }
}

/** Reconcilie l'AG Estale avec la composition du mode CS (palier 2b). Ecriture reelle. */
export async function appliquerOdjAg(
  coproCode: string,
  meetingId: string,
  supprimerMotionIds: string[],
  bankItemIds: string[],
  libres: ResolutionLibre[],
  ordreTopExistant: string[],
): Promise<{ supprimees: number; ajoutees: number }> {
  return getAssembleeEstaleProvider().appliquerOdj(
    coproCode,
    meetingId,
    supprimerMotionIds,
    bankItemIds,
    libres,
    ordreTopExistant,
  );
}

/** Cree une nouvelle AG ordinaire dans Estale pour la copro (palier 3). Ecriture reelle. */
export async function creerAssembleeAg(coproCode: string): Promise<string> {
  return getAssembleeEstaleProvider().creerAssemblee(coproCode);
}
