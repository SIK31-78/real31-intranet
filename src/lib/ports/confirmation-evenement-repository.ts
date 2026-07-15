// Port : confirmation des dates de CS / AG (demande patron, 2026-07). Une prochaine
// date posee est proposee au conseil syndical (a_confirmer) puis confirmee au retour
// de mail. Etat persiste dans la table native intranet_confirmations_evenement
// (une ligne par copro et par type).

import type { ConfirmationEvenement, ModeReunion } from "@/lib/domain/confirmation-evenement";

export interface ConfirmationEvenementRepository {
  /** Confirmations des copros `codes` (lecture batch pour le calendrier). */
  getPourCopros(codes: string[]): Promise<ConfirmationEvenement[]>;
  /** Confirmations (AG et CS) d'une copro. */
  get(coproCode: string): Promise<ConfirmationEvenement[]>;
  /** Upsert statut confirme : le conseil syndical a valide la date. */
  confirmer(coproCode: string, type: "AG" | "CS", date: string, par: string): Promise<void>;
  /** Upsert statut a_confirmer - appele quand une prochaine date est posee / changee. */
  proposer(coproCode: string, type: "AG" | "CS", date: string): Promise<void>;
  /**
   * Pose (eventId + boite) ou efface (null + null) la projection Outlook de
   * l'evenement : id Graph de l'evenement projete et agenda ou il vit.
   * Renvoie `true` si une ligne a bien ete mise a jour (id memorise), `false` si
   * AUCUNE ligne n'existe pour (copro, type) ou si la persistance a echoue. Ce
   * booleen permet a l'appelant de detecter un evenement ORPHELIN (cree cote Graph
   * mais dont l'id n'a pas pu etre memorise) et de le supprimer -> jamais de doublon.
   */
  enregistrerProjection(
    coproCode: string,
    type: "AG" | "CS",
    eventId: string | null,
    boite: string | null,
  ): Promise<boolean>;
  /**
   * Pose (ou efface avec null) la salle et le vehicule reserves pour l'evenement
   * (copro, type) : UPDATE cible de la ligne existante (comme enregistrerProjection).
   * No-op si aucune ligne n'existe. Degrade proprement si les colonnes ne sont pas
   * encore deployees (l'app fonctionne comme avant, sans ressources persistees).
   */
  enregistrerRessources(
    coproCode: string,
    type: "AG" | "CS",
    salleEmail: string | null,
    vehiculeEmail: string | null,
  ): Promise<void>;
  /**
   * Pose (ou efface avec null) le mode de tenue (visio / presentiel / hybride) de
   * l'evenement (copro, type) : UPDATE cible SEPARE (comme enregistrerRessources).
   * Separe pour que l'absence de la colonne mode_reunion (ALTER pas encore lance) ne
   * fasse pas echouer, au passage, la persistance de la salle / du vehicule. No-op si
   * aucune ligne n'existe, et degrade proprement si la colonne n'est pas deployee.
   */
  enregistrerModeReunion(
    coproCode: string,
    type: "AG" | "CS",
    mode: ModeReunion | null,
  ): Promise<void>;
}
