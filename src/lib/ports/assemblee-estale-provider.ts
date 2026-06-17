// Port (contrat) de l'AG eStale (Meeting + motions). LECTURE pour l'instant
// (palier 1) ; les ecritures (ajout/suppression/ordre des motions) viendront.
// Ne depend que du domaine.

import type { AssembleeAg } from "@/lib/domain/assemblee";

export interface AssembleeEstaleProvider {
  /** L'AG eStale pertinente d'une copro (ORDINARY non close en priorite), ou null. */
  getAssemblee(coproCode: string): Promise<AssembleeAg | null>;
}
