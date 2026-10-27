// Domaine du tri de mail (porte depuis assistant-ia). Types purs partages par
// l'ingestion et le pipeline deterministe (clean/group/sender). Ne depend que du domaine.

import type { Correspondant } from "@/lib/domain/mes-emails";

/** Mail normalise, issu de l'ingestion (Graph) ou d'un echantillon de test. */
export interface RawMail {
  id: string;
  /** Message-Id RFC, immuable et global -> cle stable du mail (etat, journal du tri). */
  internetMessageId: string;
  /** Id de conversation Graph (le fil) -> ancre d'affaire. */
  conversationId?: string;
  from: string;
  /** Nom affiche de l'expediteur ("Marc Delmas"), si Graph le donne. */
  fromName?: string;
  to: string[];
  /** En-tête complet (noms compris), si la source le donne : À, Cc, Répondre à. */
  toDetail?: Correspondant[];
  ccDetail?: Correspondant[];
  replyTo?: Correspondant[];
  /** Dernier geste d'Outlook sur le mail (PidTagLastVerbExecuted : 102, 103, 104…). */
  dernierVerbe?: number;
  subject: string;
  /** ISO 8601. */
  receivedAt: string;
  bodyText: string;
  /** Copropriete best-effort (dossier source ou extraction) ; "" si inconnue. */
  copro: string;
  attachments: { name: string; contentType?: string; sizeBytes?: number }[];
  /** Lien Outlook sur le web vers ce mail (Graph `webLink`), si connu. */
  webLink?: string;
}
