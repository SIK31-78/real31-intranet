// Service : classe un mail dans le sous-dossier Outlook de la copro (best-effort).
// Passe par le routeur (ADR-001).

import { getMailboxProvider } from "@/lib/adapters/router";

export async function classerDansCopro(
  boite: string,
  internetMessageId: string,
  coproCode: string,
  coproNom: string,
): Promise<{ deplace: boolean; dossier?: string }> {
  return getMailboxProvider().classerDansCopro({ boite, internetMessageId, coproCode, coproNom });
}
