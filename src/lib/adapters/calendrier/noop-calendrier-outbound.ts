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
    ressources?: string[];
    participants?: string[];
  }): Promise<{ id?: string; webLink?: string }> {
    // Pas de PII en log : seulement la date, la presence d'un lieu et les NOMBRES de
    // ressources / participants (jamais les emails).
    const nbRessources = p.ressources?.length ?? 0;
    const nbParticipants = p.participants?.length ?? 0;
    console.log(
      `[calendrier-outbound:noop] evenement simule le ${p.debut} (lieu: ${p.lieu ? "oui" : "non"}, ressources: ${nbRessources}, participants: ${nbParticipants})`,
    );
    return {};
  }

  async mettreAJourEvenement(): Promise<void> {
    console.log("[calendrier-outbound:noop] mise a jour simulee");
  }

  async supprimerEvenement(): Promise<void> {
    console.log("[calendrier-outbound:noop] suppression simulee");
  }

  async disponibiliteSalle(): Promise<"libre" | "occupee" | "inconnu"> {
    // Sans Graph reel, pas de verification possible : degrade "inconnu" (l'UI n'affiche
    // aucun blocage, seulement l'indicateur "dispo inconnue").
    return "inconnu";
  }
}
