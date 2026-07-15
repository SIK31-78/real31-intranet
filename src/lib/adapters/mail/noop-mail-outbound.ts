// Adapter sortant "no-op" : ne cree rien (pas de Graph). Permet de cliquer le
// bouton sans erreur quand MAIL_SOURCE != graph (dev / demo sans boite reelle).

import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";

export class NoopMailOutboundProvider implements MailOutboundProvider {
  async creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void> {
    console.log(`[mail-outbound:noop] brouillon simule pour ${p.internetMessageId} (${p.corps.length} car.)`);
  }

  async envoyer(p: {
    boite: string;
    internetMessageId: string;
    corps: string;
    a: string[];
    cc: string[];
    cci: string[];
  }): Promise<void> {
    // Pas de PII en log (RGPD) : seulement le nombre de destinataires, pas les adresses.
    console.log(`[mail-outbound:noop] envoi simule pour ${p.internetMessageId} (${p.a.length} dest.)`);
  }

  async creerBrouillonNeuf(p: {
    boite: string;
    sujet: string;
    corps: string;
    a?: string[];
    cc?: string[];
  }): Promise<{ webLink?: string }> {
    // No-op tracable : pas de Graph, donc pas de webLink (le bouton UI degradera).
    console.log(`[mail-outbound:noop] brouillon neuf simule (${p.corps.length} car.)`);
    return {};
  }

  async envoyerNeuf(p: {
    boite: string;
    a: string[];
    cc: string[];
    cci: string[];
    sujet: string;
    corps: string;
  }): Promise<void> {
    // Pas de PII en log (RGPD) : nombre de destinataires seulement, jamais les adresses.
    console.log(`[mail-outbound:noop] mail neuf simule (${p.a.length} dest., ${p.corps.length} car.)`);
  }
}
