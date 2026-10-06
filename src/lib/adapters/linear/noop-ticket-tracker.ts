// Adapter "suivi de tickets" no-op : ne cree rien, ne lit rien. Sert quand
// LINEAR_API_KEY / LINEAR_TEAM_ID sont absents (dev, tests, build de preview).
//
// C'est LE filet du pont : sans cle, le module de remontees continue de fonctionner
// exactement comme avant (le bouton enregistre, /admin/feedback pilote, /nouveautes
// affiche). Seule la synchro est inerte, et elle le dit.

import type { Feedback } from "@/lib/domain/feedback";
import type { EtatTicket, TicketCree, TicketTracker } from "@/lib/ports/ticket-tracker";

export class NoopTicketTracker implements TicketTracker {
  estActif(): boolean {
    return false;
  }

  async creerTicket(remontee: Feedback): Promise<TicketCree> {
    // Jamais appele par le service (il teste estActif avant), mais on refuse
    // explicitement plutot que de rendre un faux ticket qu'on ecrirait en base.
    throw new Error(
      `Suivi de tickets non configuré : la remontée « ${remontee.titre} » n'a pas été poussée.`,
    );
  }

  async renommerTicket(): Promise<void> {
    // Rien a renommer : aucun ticket n'existe sans suivi branche.
  }

  async lireEtats(): Promise<EtatTicket[]> {
    return [];
  }
}
