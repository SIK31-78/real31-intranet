// Port : signature email d'un gestionnaire (source Signitic, qui gere les
// signatures du reseau). Sert a "reprendre la signature" au moment de la reponse,
// et a signer les textes generes (annonce de l'AG, REA-144) avec la ligne directe.
// Ne depend de rien (pas de type domaine necessaire).

/** Profil Signitic d'un collaborateur (champs utiles a une signature texte). */
export interface ProfilSignature {
  prenom: string;
  nom: string;
  /** Ligne directe (champ `phone` de Signitic), ex "01 47 84 00 71" ; absente = omise. */
  ligneDirecte?: string;
  /** Fonction (champ `title` de Signitic). */
  fonction?: string;
}

export interface SignatureProvider {
  /** Signature HTML du gestionnaire (par email) ; null si indisponible. */
  getSignatureHtml(email: string): Promise<string | null>;
  /** Profil du gestionnaire (par email) ; null si indisponible (cle absente, erreur, 404). */
  getProfil(email: string): Promise<ProfilSignature | null>;
}
