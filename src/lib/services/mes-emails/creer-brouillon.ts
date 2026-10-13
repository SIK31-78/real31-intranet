// Service : cree un brouillon de reponse dans la boite qui DETIENT le mail d'origine
// (rattache a ce mail). Depuis le multi-boites (2026-08-23), ce n'est plus forcement la
// boite personnelle : un mail de syndic2 doit produire son brouillon dans syndic2, sinon
// `createReply` ne trouve pas le message. Passe par le routeur (ADR-001).

import { getMailOutboundProvider } from "@/lib/adapters/router";

export async function creerBrouillonOutlook(
  boite: string,
  internetMessageId: string,
  corps: string,
): Promise<void> {
  if (!boite) throw new Error("Pas de boite ciblee : impossible de creer le brouillon.");
  await getMailOutboundProvider().creerBrouillon({ boite, internetMessageId, corps });
}
