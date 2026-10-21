// Port : les biens hors syndic (intranet_bien, ADR-049). Lecture seule pour l'instant : les
// biens d'Asnieres arrivent par la reprise Keyko (scripts/import-cles-keyko.mjs), la saisie
// a l'ecran viendra avec le formulaire « copro ou bien ».

import type { BienHorsSyndic } from "@/lib/domain/bien";

export interface BienRepository {
  /** Les biens d'une agence (ou du cabinet), actifs seulement sauf demande. [] si la table est absente. */
  lister(f?: { agenceCode?: string; inclureInactifs?: boolean }): Promise<BienHorsSyndic[]>;
  get(id: string): Promise<BienHorsSyndic | null>;
}
