// Gestionnaire : identite minimale de l'utilisateur courant (cloisonnement).
// Domaine pur.

export interface Gestionnaire {
  /** Id technique = public."User".id (sert de cle de cloisonnement via managerId). */
  id: string;
  nomComplet: string;
  initiales: string;
}
