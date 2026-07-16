// Port (contrat) de l'AG Estale (Meeting + motions). LECTURE pour l'instant
// (palier 1) ; les ecritures (ajout/suppression/ordre des motions) viendront.
// Ne depend que du domaine.

import type { AssembleeAg, ResolutionLibre } from "@/lib/domain/assemblee";

export interface AssembleeEstaleProvider {
  /** L'AG Estale pertinente d'une copro (ORDINARY non close en priorite), ou null. */
  getAssemblee(coproCode: string): Promise<AssembleeAg | null>;
  /**
   * Reconcilie l'AG Estale avec la composition du mode CS. Supprime (`supprimerMotionIds`),
   * ajoute (`bankItemIds` de la bibliotheque + `libres`), puis reordonne TOUT : les motions
   * de tete existantes dans l'ordre `ordreTopExistant`, puis les nouvelles ; rangs
   * hierarchiques pour nester les groupes. `coproCode` sert a relire l'AG. Ecriture reelle.
   *
   * IDEMPOTENT par construction (audit API 2026-07-16, P0-4) : l'implementation RELIT l'etat
   * reel de l'AG avant d'appliquer et ne joue que le DELTA - une suppression deja faite est
   * sautee, une motion deja creee par une application precedente (interrompue par un 502 puis
   * relancee) est ADOPTEE au lieu d'etre dupliquee (`dejaPresentes`). Rejouer 2x = meme etat.
   */
  appliquerOdj(
    coproCode: string,
    meetingId: string,
    supprimerMotionIds: string[],
    bankItemIds: string[],
    libres: ResolutionLibre[],
    ordreTopExistant: string[],
  ): Promise<{ supprimees: number; ajoutees: number; dejaPresentes: number }>;
  /**
   * Cree une nouvelle AG ordinaire dans Estale pour la copro (palier 3). Estale
   * auto-injecte le socle standard. Renvoie l'id du Meeting cree. Ecriture reelle.
   */
  creerAssemblee(coproCode: string): Promise<string>;
}
