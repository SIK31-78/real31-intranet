// Port : annuaire de contacts (email -> copro). Permet d'attribuer un mail a une copro
// par l'email de l'EXPEDITEUR. Ne depend de rien (ADR-001).
//
// SOURCE = transitionnelle. Aujourd'hui : import du gros annuaire CRYPTO dans
// intranet_crypto_contacts (les copros pilote ne sont pas sur eStale). DEMAIN : pour
// les copros sur eStale, l'`email -> coproprietaire -> copro` se lit LIVE via l'API
// (plus simple, pas d'import). La migration est LEGERE par design : ce port reste le
// meme, on ajoute juste un adapter eStale (ou un resolveur de plus dans la cascade de
// la synchro). Le code appelant ne change pas. Cf. ROADMAP "attribution copro".

export interface CryptoContactsProvider {
  /** Pour chaque email donne, les codes copro associes (0, 1 ou plusieurs). Lookup en
   *  LOT (une requete). Cle = email en minuscules. */
  coprosPourEmails(emails: string[]): Promise<Map<string, string[]>>;
}
