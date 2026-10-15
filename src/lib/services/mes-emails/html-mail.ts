// Le mail tel qu'il a été écrit, en HTML (REA-328) : photos collées dans le corps, signatures,
// mise en forme. Lu à l'ouverture du mail, dans la boîte qui le détient ; le texte seul reste
// disponible (bouton « Texte seul »). Passe par le routeur (ADR-001).

import { getMailboxProvider } from "@/lib/adapters/router";
import { htmlAffichable } from "@/lib/domain/mail-html";

/** Le HTML prêt pour l'iframe, ou "" si le mail n'en a pas. */
export async function htmlDuMail(boite: string, internetMessageId: string): Promise<string> {
  const { html, inline } = await getMailboxProvider().lireHtml({ boite, internetMessageId });
  return html ? htmlAffichable(html, inline) : "";
}
