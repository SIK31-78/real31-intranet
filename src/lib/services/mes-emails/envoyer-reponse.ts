// Service : ENVOIE la reponse au mail (vrai envoi, action irreversible) avec les
// destinataires choisis. Passe par le routeur (ADR-001) ; l'envoi reel n'a lieu qu'en
// MAIL_SOURCE=graph (sinon no-op). Le cloisonnement est verifie dans la server action.

import { getMailOutboundProvider } from "@/lib/adapters/router";

export async function envoyerReponseMail(p: {
  boite: string;
  internetMessageId: string;
  corps: string;
  sujet?: string;
  a: string[];
  cc: string[];
  cci: string[];
  signatureHtml?: string;
  pjIds?: string[];
}): Promise<void> {
  return getMailOutboundProvider().envoyer(p);
}
