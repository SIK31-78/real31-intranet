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
   * `ressources` : emails de salles / vehicules (room mailboxes) ajoutes comme
   * attendees de type "resource" -> la salle auto-accepte si le creneau est libre.
   * `participants` : emails de collegues (gestionnaires) ajoutes comme attendees de
   * type "required" -> l'evenement apparait dans LEUR agenda (distinct de `ressources`).
   */
  creerEvenement(p: {
    boite: string;
    sujet: string;
    debut: string;
    fin?: string;
    journeeEntiere?: boolean;
    lieu?: string;
    description?: string;
    ressources?: string[];
    participants?: string[];
  }): Promise<{ id?: string; webLink?: string }>;

  /**
   * Met a jour un evenement existant : `titre` (subject) et/ou `debut`. Si `debut`
   * est un jour seul ('YYYY-MM-DD'), l'evenement est replace en journee entiere sur
   * ce jour ; s'il porte une heure (ISO datetime), il devient un evenement date de
   * `fin - debut` (fin par defaut = debut + duree reunion). Champs absents = inchanges.
   * `ressources` (si fourni) REMPLACE la liste des attendees de type "resource"
   * (salles / vehicules) - `[]` retire toute ressource, absent = inchange.
   * `participants` (si fourni) REMPLACE la liste des attendees de type "required"
   * (collegues) - `[]` retire tout collegue, absent = inchange.
   * `lieu` (si fourni) remplace le libelle de lieu (location) - reflete le mode de
   * tenue ("Visio" en visio, sinon la salle) ; absent = inchange.
   * NB Graph : le PATCH `attendees` ecrase TOUTE la liste ; l'adapter recompose donc
   * ressources + participants ensemble quand l'un ou l'autre est fourni.
   */
  mettreAJourEvenement(
    boite: string,
    eventId: string,
    patch: {
      titre?: string;
      debut?: string;
      fin?: string;
      ressources?: string[];
      participants?: string[];
      lieu?: string;
    },
  ): Promise<void>;

  /**
   * Disponibilite d'une salle (room mailbox) sur un creneau, via getSchedule de la
   * `boite` interrogeante. `debutISO` / `finISO` : datetime local 'YYYY-MM-DDTHH:mm:ss'
   * (fuseau Europe/Paris). Renvoie "libre" / "occupee" d'apres l'availabilityView, ou
   * "inconnu" en degrade (Graph indisponible, 403 Access Policy pas encore ouverte
   * pour les salles, reponse illisible) : l'UI n'est jamais bloquee.
   */
  disponibiliteSalle(
    boite: string,
    salleEmail: string,
    debutISO: string,
    finISO: string,
  ): Promise<"libre" | "occupee" | "inconnu">;

  /**
   * Supprime un evenement de l'agenda. Tolere l'evenement deja absent (404 = deja
   * supprime, ex. efface a la main dans Outlook) : ne throw pas dans ce cas.
   */
  supprimerEvenement(boite: string, eventId: string): Promise<void>;
}
