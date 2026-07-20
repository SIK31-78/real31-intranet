// Port (contrat) du referentiel des agences REAL31. Source reelle : public."Agency"
// (App A), colonnes id + name. Le `code` du domaine EST le `name` de la table
// (ML / LGC / HLS / ASN). Sert a resoudre l'agence technique (id) d'une copro / d'un
// User en un code lisible, utilise pour le cloisonnement par agence cote UI.
// Ne depend que de types simples (pas de domaine dedie : 4 lignes, id + code).

export interface Agence {
  /** Id technique = public."Agency".id (valeur des FK agencyId copro / user). */
  id: string;
  /** Code lisible = public."Agency".name : ML / LGC / HLS / ASN. */
  code: string;
}

export interface AgenceRepository {
  /** Liste les agences du cabinet (4 lignes). Degrade en [] si la table est absente. */
  listerAgences(): Promise<Agence[]>;
}
