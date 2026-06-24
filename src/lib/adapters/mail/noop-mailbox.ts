// Adapter "boite aux lettres" no-op : ne deplace rien (pas de Graph). Pour
// MAIL_SOURCE != graph (dev/demo) -> le classement reste cote intranet seulement.

import type { MailboxProvider } from "@/lib/ports/mailbox-provider";

export class NoopMailboxProvider implements MailboxProvider {
  async classerDansCopro(p: {
    boite: string;
    internetMessageId: string;
    coproCode: string;
    coproNom: string;
  }): Promise<{ deplace: boolean; dossier?: string }> {
    console.log(`[mailbox:noop] classement simule de ${p.internetMessageId} (copro ${p.coproCode})`);
    return { deplace: false };
  }
}
