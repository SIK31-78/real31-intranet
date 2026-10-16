// Service : TRANSFERE un mail de l'écran E-mails à un collègue ou à l'extérieur (REA-350,
// 16/10/2026). Depuis la boîte qui détient le mail : c'est la seule où Graph sait faire un
// createForward, et les pièces jointes d'origine suivent. Passe par le routeur (ADR-001).
// Droits (pilote, boîte visible) et choix envoi / brouillon : dans l'action.

import { getMailOutboundProvider } from "@/lib/adapters/router";
import type { TransfertMail } from "@/lib/ports/mail-outbound-provider";

export async function transfererMail(p: TransfertMail): Promise<{ webLink?: string }> {
  return getMailOutboundProvider().transferer(p);
}
