// Service : l'AG Estale d'une copro (palier 1, lecture). Passe par le routeur
// (ADR-001). Degrade proprement : null si pas d'AG ou si Estale tombe.

import { cache } from "react";
import type { AssembleeAg, ResolutionLibre } from "@/lib/domain/assemblee";
import { getAssembleeEstaleProvider } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

// React.cache : dedupe les appels avec le meme coproCode dans un meme rendu serveur
// (pas de persistance entre requetes ; cf get-bibliotheque.ts pour le meme choix).
export const getAssemblee = cache(async (coproCode: string): Promise<AssembleeAg | null> => {
  try {
    return await getAssembleeEstaleProvider().getAssemblee(coproCode);
  } catch (err) {
    console.warn(`[assemblee] Estale indisponible pour ${coproCode} :`, (err as Error).message);
    return null;
  }
});

/** Reconcilie l'AG Estale avec la composition du mode CS (palier 2b). Ecriture reelle. */
export async function appliquerOdjAg(
  coproCode: string,
  meetingId: string,
  supprimerMotionIds: string[],
  bankItemIds: string[],
  libres: ResolutionLibre[],
  ordreTopExistant: string[],
  managerId: string,
): Promise<{ supprimees: number; ajoutees: number }> {
  await exigerPerimetre(coproCode, managerId);
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
export async function creerAssembleeAg(coproCode: string, managerId: string): Promise<string> {
  await exigerPerimetre(coproCode, managerId);
  return getAssembleeEstaleProvider().creerAssemblee(coproCode);
}
