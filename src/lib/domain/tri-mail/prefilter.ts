// Pre-filtre DETERMINISTE, avant tout modele (porte depuis assistant-ia). Attrape
// le bruit par regles sur l'expediteur/objet, sans IA. Fonction pure.

import type { RawMail } from "./raw-mail";
import { cleanBody, isAttachedImageScan, significantAttachments } from "./clean";

export type PrefilterDecision =
  | { decision: "non_ticketable"; reason: string }
  | { decision: "ocr_queue"; reason: string }
  | { decision: "pass" };

const NOREPLY =
  /no[-_. ]?reply|noreply|ne[-_. ]?pas[-_. ]?r[ée]pondre|do[-_. ]?not[-_. ]?reply|mailer-daemon|postmaster/i;
const AUTO_DOMAIN =
  /extranet|asana\.com|ag[-.]connect|esign(live)?|docusign|\.otis\.com|notification|aareon|sinao/i;
const ACK_SUBJECT = /accus[ée]\s+(de\s+)?r[ée]ception|\[ticket\s*n[°ºo]|\bods\s*n[°ºo]|read receipt/i;
const OOO_SUBJECT =
  /r[ée]ponse automatique|automatic reply|out of office|absence du bureau|message d'absence/i;
const NOTIF_SUBJECT = /^(otis info|info otis)\b|notification automatique/i;
const REPLY_PREFIX = /^\s*(re|ré|rép|tr|fw|fwd)\s*:/i;

export function prefilter(mail: RawMail): PrefilterDecision {
  const from = (mail.from ?? "").toLowerCase();
  const subject = mail.subject ?? "";

  if (isAttachedImageScan(mail)) return { decision: "ocr_queue", reason: "scan_papier" };

  if (NOREPLY.test(from)) return { decision: "non_ticketable", reason: "expediteur_noreply" };
  if (AUTO_DOMAIN.test(from)) return { decision: "non_ticketable", reason: "domaine_automatique" };

  if (OOO_SUBJECT.test(subject)) return { decision: "non_ticketable", reason: "reponse_absence" };
  if (ACK_SUBJECT.test(subject)) return { decision: "non_ticketable", reason: "accuse_reception" };
  if (NOTIF_SUBJECT.test(subject)) return { decision: "non_ticketable", reason: "notification_auto" };

  // Courtoisie pure : reponse, corps tres court, sans question ni PJ utile.
  const body = cleanBody(mail);
  if (
    REPLY_PREFIX.test(subject) &&
    body.length < 60 &&
    !body.includes("?") &&
    significantAttachments(mail).length === 0
  ) {
    return { decision: "non_ticketable", reason: "courtoisie" };
  }

  return { decision: "pass" };
}
