// Port du module Sinistre (persistance serveur cloisonnee). Ne depend que du domaine.
//
// Le `DossierState` est l'agregat metier du dossier sinistre (locaux, parties,
// mesures, rendez-vous...). Il vit dans le domaine pur (types/dossier-state.ts),
// donc cet adapter serveur n'importe rien de cote client.
//
// CLOISONNEMENT : `managerId` est OBLIGATOIRE sur chaque methode. La lecture comme
// l'ecriture ne portent que sur des copros du perimetre du gestionnaire (anti-IDOR :
// le coproCode vient du client, on ne lui fait jamais confiance).

import type { DossierState } from "@/lib/domain/sinistre/types";

/**
 * Persistance indisponible (table `intranet_sinistres` pas encore creee). Vit dans le
 * port (pas dans l'adapter) pour rester importable cote action sans violer la frontiere
 * app -> adapter : l'action distingue ce cas (degrade) d'une vraie erreur d'ecriture.
 */
export class SinistrePersistanceIndisponible extends Error {
  constructor() {
    super("Persistance sinistre indisponible (table absente).");
    this.name = "SinistrePersistanceIndisponible";
  }
}

export interface SinistreRepository {
  /** Le dossier `id`, ou null s'il est absent OU hors du perimetre du gestionnaire. */
  get(id: string, managerId: string): Promise<DossierState | null>;
  /**
   * Cree un dossier. Le perimetre (etat.coproprieteId appartient au gestionnaire)
   * est verifie AVANT insert. La `reference_interne` est generee cote serveur.
   */
  creer(input: { etat: DossierState; managerId: string }): Promise<{ id: string; referenceInterne: string }>;
  /** Met a jour un dossier existant (no-op si absent / hors perimetre). */
  patch(id: string, fields: Partial<DossierState>, managerId: string): Promise<void>;
}
