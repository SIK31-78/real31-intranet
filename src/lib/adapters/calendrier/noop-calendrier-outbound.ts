// Adapter calendrier "no-op" : ne touche a rien (pas de Graph). Utilise quand
// MAIL_SOURCE != graph (dev / demo sans boite reelle) : la projection Outlook est
// simplement sautee, la donnee intranet reste la seule ecrite. Pas d'id renvoye a
// la creation -> aucun enregistrement de projection cote appelant.

import type { CalendrierOutboundProvider } from "@/lib/ports/calendrier-outbound-provider";

export class NoopCalendrierOutboundProvider implements CalendrierOutboundProvider {
  async creerEvenement(p: {
    boite: string;
    sujet: string;
    debut: string;
    fin?: string;
    journeeEntiere?: boolean;
    lieu?: string;
    description?: string;
  }): Promise<{ id?: string; webLink?: string }> {
    // Pas de PII en log : seulement la date et la presence d'un lieu.
    console.log(`[calendrier-outbound:noop] evenement simule le ${p.debut} (lieu: ${p.lieu ? "oui" : "non"})`);
    return {};
  }

  async mettreAJourEvenement(): Promise<void> {
    console.log("[calendrier-outbound:noop] mise a jour simulee");
  }

  async supprimerEvenement(): Promise<void> {
    console.log("[calendrier-outbound:noop] suppression simulee");
  }
}
