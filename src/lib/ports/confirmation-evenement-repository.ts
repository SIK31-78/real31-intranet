// Port : confirmation des dates de CS / AG (demande patron, 2026-07). Une prochaine
// date posee est proposee au conseil syndical (a_confirmer) puis confirmee au retour
// de mail. Etat persiste dans la table native intranet_confirmations_evenement
// (une ligne par copro et par type).

import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";

export interface ConfirmationEvenementRepository {
  /** Confirmations des copros `codes` (lecture batch pour le calendrier). */
  getPourCopros(codes: string[]): Promise<ConfirmationEvenement[]>;
  /** Confirmations (AG et CS) d'une copro. */
  get(coproCode: string): Promise<ConfirmationEvenement[]>;
  /** Upsert statut confirme : le conseil syndical a valide la date. */
  confirmer(coproCode: string, type: "AG" | "CS", date: string, par: string): Promise<void>;
  /** Upsert statut a_confirmer - appele quand une prochaine date est posee / changee. */
  proposer(coproCode: string, type: "AG" | "CS", date: string): Promise<void>;
}
