// Adapter calendrier "no-op" : ne cree rien (pas de Graph). Permet de cliquer le
// bouton sans erreur quand MAIL_SOURCE != graph (dev / demo sans boite reelle).
// Pas de webLink -> l'UI degrade (mais l'action gate deja en amont sur MAIL_SOURCE).

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
  }): Promise<{ webLink?: string }> {
    // Pas de PII en log : seulement la date et la presence d'un lieu.
    console.log(`[calendrier-outbound:noop] evenement simule le ${p.debut} (lieu: ${p.lieu ? "oui" : "non"})`);
    return {};
  }
}
