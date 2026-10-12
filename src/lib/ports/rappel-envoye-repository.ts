// Port (contrat) de la trace des rappels automatiques deja envoyes (table native
// intranet_rappels_envoyes). Sert l'IDEMPOTENCE des crons : on RESERVE la cle avant
// d'envoyer, on la LIBERE si l'envoi echoue (le prochain passage retentera).

export interface RappelEnvoyeRepository {
  /**
   * Reserve la cle. true = reservee a l'instant (on peut envoyer) ; false = deja
   * envoyee (on n'envoie pas). Leve si la trace est illisible (table absente comprise) :
   * sans trace, on n'envoie RIEN plutot que de renvoyer le meme rappel chaque jour.
   */
  reserver(cle: string): Promise<boolean>;
  /** Libere une cle reservee dont l'envoi a echoue. */
  liberer(cle: string): Promise<void>;
}
