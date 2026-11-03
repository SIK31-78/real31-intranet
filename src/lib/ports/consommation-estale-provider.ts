// Port : ce qu'ESTALE facture a REAL31 (REA-490). Lecture seule.
//
// Chaque mois, ESTALE emet une facture a l'agence (abonnements, envois). Son detail Excel
// liste chaque envoi avec sa copro : c'est la source des frais postaux AU REEL.

import type { LigneConsommationEstale } from "@/lib/domain/facturation/frais-postaux-reels";

export interface FactureEstaleRecue {
  /** Ex "QXDJABFB-0004". */
  reference: string;
  /**
   * Date de la facture, ISO "YYYY-MM-DD" : le 1er du mois CONSOMME (QXDJABFB-0002, datee du
   * 01/08/2026, porte la « Consommation Août 2026 »).
   */
  dateISO: string;
  montantHt: number;
  montantTtc: number;
  /** ISSUED, PAID… tel que rendu par ESTALE. */
  statut: string;
}

export interface ConsommationEstaleProvider {
  /** Factures ESTALE de l'agence, la plus recente d'abord. */
  listerFactures(): Promise<FactureEstaleRecue[]>;
  /** Detail ligne a ligne d'une facture. Leve une erreur si la reference est inconnue. */
  lireConsommation(reference: string): Promise<LigneConsommationEstale[]>;
  /**
   * Copros de chaque mailing ESTALE, par identifiant : rattache les envois dont le detail
   * ne porte pas de code copro (« Faisons connaissance… »).
   */
  coprosDesMailings(): Promise<Map<string, string[]>>;
}
