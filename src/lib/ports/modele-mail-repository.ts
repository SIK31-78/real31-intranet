// Port : les modèles de mail stockés (REA-296). Ne dépend que du domaine (ADR-001).

import type { ModeleMailStocke } from "@/lib/domain/modeles-mail";

export interface SaisieModeleMail {
  titre: string;
  sujet: string;
  corps: string;
  /** Code d'agence, ou null pour tout le cabinet. */
  agence: string | null;
  actif: boolean;
  auteurEmail?: string;
}

export interface ModeleMailRepository {
  /** Tous les modèles, actifs ou non. Lève ModelesMailNonConfigureError si la table manque. */
  listerTous(): Promise<ModeleMailStocke[]>;
  /** Un modèle par son id, ou null. */
  trouver(id: string): Promise<ModeleMailStocke | null>;
  creer(s: SaisieModeleMail): Promise<ModeleMailStocke>;
  /** Remplace les champs du modèle ; null s'il n'existe plus. */
  modifier(id: string, s: SaisieModeleMail): Promise<ModeleMailStocke | null>;
  supprimer(id: string): Promise<boolean>;
}
