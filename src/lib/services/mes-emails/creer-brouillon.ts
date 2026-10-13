// Service : cree un brouillon de reponse dans la boite qui DETIENT le mail d'origine
// (rattache a ce mail). Depuis le multi-boites (2026-08-23), ce n'est plus forcement la
// boite personnelle : un mail de syndic2 doit produire son brouillon dans syndic2, sinon
// `createReply` ne trouve pas le message. Passe par le routeur (ADR-001).

import { getMailOutboundProvider } from "@/lib/adapters/router";
import type { ReponseMail } from "@/lib/ports/mail-outbound-provider";

/**
 * La réponse préparée dans l'intranet (destinataires, objet, pièces jointes du mail et
 * fichiers ajoutés) devient un brouillon dans la boîte qui détient le mail. Rien ne part.
 */
export async function creerBrouillonReponse(p: ReponseMail): Promise<{ webLink?: string }> {
  if (!p.boite) throw new Error("Pas de boite ciblee : impossible de creer le brouillon.");
  return getMailOutboundProvider().creerBrouillonReponse(p);
}
