// Adapter sortant "no-op" : ne cree rien (pas de Graph). Permet de cliquer le
// bouton sans erreur quand MAIL_SOURCE != graph (dev / demo sans boite reelle).

import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";

export class NoopMailOutboundProvider implements MailOutboundProvider {
  async creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void> {
    console.log(`[mail-outbound:noop] brouillon simule pour ${p.internetMessageId} (${p.corps.length} car.)`);
  }
}
