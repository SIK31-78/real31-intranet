// Port (contrat) de l'etat des jalons d'AG (table native intranet_jalons).
// Le calcul des cibles vit dans le domaine (jalons-ag) ; ce port porte l'ETAT
// (fait / pas fait) persiste. Ne depend que du domaine.

import type { JalonAvecEtat, JalonCode, StatutJalon } from "@/lib/domain/jalons-ag/types";

/** Etat brut d'un jalon (pour les vues agregees, ex Mes evenements, dashboard). */
export interface EtatJalon {
  coproCode: string;
  agDate: string;
  type: JalonCode;
  statut: StatutJalon;
  marquePar?: string;
  /** Horodatage ISO du dernier marquage. */
  marqueAt?: string;
}

export interface MarquageJalon {
  /** Code copro (referenceCrypto), cle logique dans intranet_jalons. */
  coproCode: string;
  /** Date de l'AG, ISO "YYYY-MM-DD". */
  agDate: string;
  type: JalonCode;
  statut: StatutJalon;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface JalonRepository {
  /** Les 5 jalons d'une AG : cibles calculees + etat persiste fusionnes. */
  getJalons(coproCode: string, agDateISO: string): Promise<JalonAvecEtat[]>;
  /** Marque un jalon (upsert de l'etat). */
  marquer(input: MarquageJalon): Promise<void>;
  /** Etats persistes pour un lot de copros (vue agregee). */
  getEtats(coproCodes: string[]): Promise<EtatJalon[]>;
}
