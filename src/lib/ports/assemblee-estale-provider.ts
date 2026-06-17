// Port (contrat) de l'AG eStale (Meeting + motions). LECTURE pour l'instant
// (palier 1) ; les ecritures (ajout/suppression/ordre des motions) viendront.
// Ne depend que du domaine.

import type { AssembleeAg, ResolutionLibre } from "@/lib/domain/assemblee";

export interface AssembleeEstaleProvider {
  /** L'AG eStale pertinente d'une copro (ORDINARY non close en priorite), ou null. */
  getAssemblee(coproCode: string): Promise<AssembleeAg | null>;
  /**
   * Reconcilie l'AG eStale avec la composition du mode CS. Supprime (`supprimerMotionIds`),
   * ajoute (`bankItemIds` de la bibliotheque + `libres`), puis reordonne TOUT : les motions
   * de tete existantes dans l'ordre `ordreTopExistant`, puis les nouvelles ; rangs
   * hierarchiques pour nester les groupes. `coproCode` sert a relire l'AG. Ecriture reelle.
   */
  appliquerOdj(
    coproCode: string,
    meetingId: string,
    supprimerMotionIds: string[],
    bankItemIds: string[],
    libres: ResolutionLibre[],
    ordreTopExistant: string[],
  ): Promise<{ supprimees: number; ajoutees: number }>;
  /**
   * Cree une nouvelle AG ordinaire dans eStale pour la copro (palier 3). eStale
   * auto-injecte le socle standard. Renvoie l'id du Meeting cree. Ecriture reelle.
   */
  creerAssemblee(coproCode: string): Promise<string>;
}
