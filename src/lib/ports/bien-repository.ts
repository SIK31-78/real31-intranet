// Port : les biens hors syndic (intranet_bien, ADR-049). Les biens d'Asnieres sont arrives par
// la reprise Keyko (scripts/import-cles-keyko.mjs) ; les nouveaux mandats se saisissent a
// l'ecran depuis le formulaire de trousseau (REA-53).

import type { BienHorsSyndic, NouveauBien } from "@/lib/domain/bien";

export interface BienRepository {
  /** Les biens d'une agence (ou du cabinet), actifs seulement sauf demande. [] si la table est absente. */
  lister(f?: { agenceCode?: string; inclureInactifs?: boolean }): Promise<BienHorsSyndic[]>;
  /**
   * Cree un bien actif (source « intranet »). Une reference deja prise dans l'agence, meme sur
   * un bien inactif, leve une Error au message lisible (messageReferenceBienExiste).
   */
  creer(agenceCode: string, bien: NouveauBien, creePar: string): Promise<BienHorsSyndic>;
  get(id: string): Promise<BienHorsSyndic | null>;
}
