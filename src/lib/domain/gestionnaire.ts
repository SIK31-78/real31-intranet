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
  /**
   * Id technique de l'agence de rattachement (public."User".agencyId, FK vers
   * public."Agency".id). Sert au CLOISONNEMENT PAR AGENCE cote UI (filtrer les
   * collaborateurs proposes a l'agence de la copro). C'est l'ID technique, PAS le
   * code (ML/LGC/HLS/ASN) : la resolution en code passe par le lecteur Agency.
   * Absent si la colonne n'est pas renseignee.
   */
  agencyId?: string;
  /**
   * Habilitations intranet (table intranet_habilitation), ex. "referent_syndic:HLS" : ce
   * que public."User".role ne sait pas dire. Resolues a la session (cf. lib/auth/roles,
   * `Profil`). Absent = aucune.
   */
  habilitations?: string[];
}

/**
 * Le role brut de public."User".role designe-t-il un COMPTABLE ? (comparaison insensible a la
 * casse et aux espaces : l'enum App A est en majuscules). Pur, pour que les services s'en
 * servent sans importer auth ; `estComptableTable` (lib/auth/roles) le reprend.
 */
export function roleComptable(role: string | null | undefined): boolean {
  return (role ?? "").trim().toUpperCase() === "COMPTABLE";
}
