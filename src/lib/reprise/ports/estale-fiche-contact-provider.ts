// Port (contrat) d'ECRITURE eStale DEDIE a la fiche de renseignements : la SEULE mutation de
// ce flux est la mise a jour de l'email d'un coproprietaire (updateOwner(id).update(OwnerInput)).
// Mutation VERIFIEE dans docs/estale-schema.graphql :
//   updateOwner(id: ID!): OwnerMutation!  puis  OwnerMutation.update(input: OwnerInput!): Owner!
// OwnerInput exige civility + lastname + resident ; email est optionnel -> on repousse les
// champs existants de l'owner INCHANGES et on ne modifie que l'email (l'adapter reel relit
// l'owner courant dans eStale pour ne rien ecraser).
//
// Deux adapters derriere ce port, choisis par le MEME gate que le reste de l'ecriture eStale
// (ESTALE_ECRITURE=reel + identifiants presents) :
//   - dry-run (defaut) : n'ecrit RIEN, renvoie une note ;
//   - reel : resout la copro + l'owner puis applique la mutation en PRODUCTION.

/** Identification de l'owner cible + le nouvel email. */
export interface MajEmailOwnerInput {
  /** Reference copro eStale (ex "S0302"). */
  coproCode: string;
  /** Nom de famille connu (matching de l'owner dans la copro eStale). */
  nom: string;
  /** Prenom connu (affine le matching quand plusieurs homonymes). */
  prenom?: string;
  /** Nouvel email a ecrire. */
  email: string;
}

/** Resultat d'une tentative de mise a jour d'email. */
export interface MajEmailResultat {
  /** true si la mutation a REELLEMENT ete appliquee dans eStale (false en dry-run). */
  applique: boolean;
  /** Note lisible (dry-run : ce qui SERAIT fait ; reel : confirmation). */
  note: string;
}

export interface EstaleFicheContactProvider {
  mettreAJourEmailOwner(input: MajEmailOwnerInput): Promise<MajEmailResultat>;
}
