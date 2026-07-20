// Gestionnaire : identite minimale de l'utilisateur courant (cloisonnement).
// Domaine pur.

export interface Gestionnaire {
  /** Id technique = public."User".id (sert de cle de cloisonnement via managerId). */
  id: string;
  nomComplet: string;
  initiales: string;
  /** Email (SSO Entra / public."User") ; sert a recuperer la signature Signitic. */
  email?: string;
  /**
   * Role brut de public."User".role (enum App A, ex "COMPTABLE"). Sert a deriver le
   * role comptable cote intranet SANS redeploiement (cf. lib/auth/roles). Absent si
   * la colonne n'est pas renseignee. Ce n'est PAS le role intranet - c'est la valeur
   * source, mappee par `estComptableTable`.
   */
  role?: string;
}
