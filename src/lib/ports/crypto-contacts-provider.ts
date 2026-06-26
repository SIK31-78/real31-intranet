// Port : annuaire de contacts Crypto (email -> copro). Permet d'attribuer un mail a
// une copro par l'email de l'EXPEDITEUR, sans eStale (les copros pilote n'y sont pas).
// Alimente par l'import du gros JSON Crypto dans intranet_crypto_contacts. Ne depend
// de rien (ADR-001).

export interface CryptoContactsProvider {
  /** Pour chaque email donne, les codes copro associes (0, 1 ou plusieurs). Lookup en
   *  LOT (une requete). Cle = email en minuscules. */
  coprosPourEmails(emails: string[]): Promise<Map<string, string[]>>;
}
