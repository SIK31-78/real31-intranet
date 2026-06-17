// Port (contrat) de l'AG eStale (Meeting + motions). LECTURE pour l'instant
// (palier 1) ; les ecritures (ajout/suppression/ordre des motions) viendront.
// Ne depend que du domaine.

import type { AssembleeAg, ResolutionLibre } from "@/lib/domain/assemblee";

export interface AssembleeEstaleProvider {
  /** L'AG eStale pertinente d'une copro (ORDINARY non close en priorite), ou null. */
  getAssemblee(coproCode: string): Promise<AssembleeAg | null>;
  /**
   * Ajoute des resolutions a une AG (palier 2a). `bankItemIds` = resolutions piochees
   * dans la bibliotheque cabinet (recreees fidelement via createMotion) ; `libres` =
   * resolutions saisies. Ecriture reelle dans eStale, additive.
   */
  ajouterAuMeeting(
    meetingId: string,
    bankItemIds: string[],
    libres: ResolutionLibre[],
  ): Promise<number>;
}
