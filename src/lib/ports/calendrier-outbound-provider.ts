// Port sortant calendrier : creer un evenement dans l'agenda d'une boite.
// En reel, Graph (POST /users/{boite}/events -> evenement Outlook). Ne depend
// de rien. La permission Calendars.ReadWrite n'est PAS encore accordee par le
// DSI : l'adapter Graph renverra 403 tant qu'elle est absente -> l'appelant doit
// degrader proprement (cf. ajouterRdvAgendaAction). Meme infra Graph que le mail.

export interface CalendrierOutboundProvider {
  /**
   * Cree un evenement dans l'agenda de la `boite` (adresse SMTP du gestionnaire).
   * `debut` : 'YYYY-MM-DD' (jour seul) ou ISO datetime. Si jour seul OU
   * `journeeEntiere`, l'evenement est cree en journee entiere. `fin` facultatif
   * (par defaut +1h pour un evenement date, lendemain pour une journee entiere).
   * Renvoie le webLink Outlook de l'evenement cree si Graph le fournit.
   */
  creerEvenement(p: {
    boite: string;
    sujet: string;
    debut: string;
    fin?: string;
    journeeEntiere?: boolean;
    lieu?: string;
    description?: string;
  }): Promise<{ webLink?: string }>;
}
