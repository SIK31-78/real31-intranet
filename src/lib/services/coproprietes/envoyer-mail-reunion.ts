// Service : ENVOIE le mail au conseil syndical (mail NEUF, action irreversible) avec les
// destinataires choisis. Passe par le routeur (ADR-001) ; l'envoi reel n'a lieu qu'en
// MAIL_SOURCE=graph (sinon no-op). Le cloisonnement + le gating sont verifies dans la
// server action ; la boite d'envoi = email de session du gestionnaire (jamais un parametre).

import { getMailOutboundProvider } from "@/lib/adapters/router";

export async function envoyerMailReunion(p: {
  boite: string;
  a: string[];
  cc: string[];
  cci: string[];
  sujet: string;
  corps: string;
  signatureHtml?: string;
}): Promise<void> {
  return getMailOutboundProvider().envoyerNeuf(p);
}
