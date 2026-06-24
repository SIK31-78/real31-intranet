// Port : signature email d'un gestionnaire (source Signitic, qui gere les
// signatures du reseau). Sert a "reprendre la signature" au moment de la reponse.
// Ne depend de rien (pas de type domaine necessaire).

export interface SignatureProvider {
  /** Signature HTML du gestionnaire (par email) ; null si indisponible. */
  getSignatureHtml(email: string): Promise<string | null>;
}
