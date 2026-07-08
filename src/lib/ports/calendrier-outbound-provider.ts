// Port sortant calendrier : creer / mettre a jour / supprimer un evenement dans
// l'agenda d'une boite. En reel, Graph (/users/{boite}/events -> evenement Outlook).
// Ne depend de rien. Meme infra Graph que le mail (token app-only). Sert a la
// PROJECTION AUTOMATIQUE des dates CS/AG (la date structuree de l'intranet reste
// LA source ; Outlook n'en recoit qu'un reflet) - l'appelant degrade proprement
// si Graph echoue (jamais bloquant pour l'intranet).

export interface CalendrierOutboundProvider {
  /**
   * Cree un evenement dans l'agenda de la `boite` (adresse SMTP du gestionnaire).
   * `debut` : 'YYYY-MM-DD' (jour seul) ou ISO datetime. Si jour seul OU
   * `journeeEntiere`, l'evenement est cree en journee entiere. `fin` facultatif
   * (par defaut +1h pour un evenement date, lendemain pour une journee entiere).
   * Renvoie l'id Graph de l'evenement cree (pour le retrouver ensuite : renommer,
   * deplacer, supprimer) et son webLink Outlook si Graph les fournit.
   */
  creerEvenement(p: {
    boite: string;
    sujet: string;
    debut: string;
    fin?: string;
    journeeEntiere?: boolean;
    lieu?: string;
    description?: string;
  }): Promise<{ id?: string; webLink?: string }>;

  /**
   * Met a jour un evenement existant : `titre` (subject) et/ou `debut`. Si `debut`
   * est un jour seul ('YYYY-MM-DD'), l'evenement est replace en journee entiere sur
   * ce jour ; s'il porte une heure (ISO datetime), il devient un evenement date de
   * `fin - debut` (fin par defaut = debut + duree reunion). Champs absents = inchanges.
   */
  mettreAJourEvenement(
    boite: string,
    eventId: string,
    patch: { titre?: string; debut?: string; fin?: string },
  ): Promise<void>;

  /**
   * Supprime un evenement de l'agenda. Tolere l'evenement deja absent (404 = deja
   * supprime, ex. efface a la main dans Outlook) : ne throw pas dans ce cas.
   */
  supprimerEvenement(boite: string, eventId: string): Promise<void>;
}
