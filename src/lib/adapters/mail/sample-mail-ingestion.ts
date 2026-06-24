// Adapter ECHANTILLON d'ingestion : quelques mails syndic realistes en dur.
// Permet de tester toute la chaine (ingest -> cerveau -> triage -> cockpit) SANS
// Microsoft Graph, avant l'accord de la permission Mail.Read. Anonymise, pas de PII.

import type { MailIngestionProvider, OptionsIngestion } from "@/lib/ports/mail-ingestion-provider";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

const ECHANTILLON: RawMail[] = [
  {
    id: "smp-1",
    from: "jean.bardet@gmail.com",
    to: ["copropriete@real31.fr"],
    subject: "S104 - Fuite au sous-sol, places 48/49",
    receivedAt: "2026-06-18T08:12:00Z",
    bodyText:
      "Bonjour,\r\n\r\nLa fuite au sous-sol est toujours aussi importante, l'eau coule sur mon vehicule. Quelle solution proposez-vous ?\r\n\r\nCordialement,\r\nJean Bardet",
    copro: "",
    attachments: [{ name: "constat.pdf", contentType: "application/pdf", sizeBytes: 220000 }],
  },
  {
    id: "smp-2",
    from: "contact@ravalys.fr",
    to: ["copropriete@real31.fr"],
    subject: "S104 Devis ravalement de facade",
    receivedAt: "2026-06-17T15:40:00Z",
    bodyText:
      "Bonjour,\r\n\r\nSuite a notre visite, vous trouverez ci-joint notre devis pour le ravalement de la facade cote rue.\r\n\r\nCordialement,\r\nEntreprise Ravalys",
    copro: "",
    attachments: [{ name: "devis-ravalement.pdf", contentType: "application/pdf", sizeBytes: 180000 }],
  },
  {
    id: "smp-3",
    from: "m.lefort@orange.fr",
    to: ["copropriete@real31.fr"],
    subject: "Ascenseur batiment A de nouveau en panne",
    receivedAt: "2026-06-16T09:05:00Z",
    bodyText:
      "Bonjour,\r\n\r\nL'ascenseur du batiment A est de nouveau bloque. C'est tres problematique pour les personnes agees. Merci d'intervenir rapidement.\r\n\r\nCordialement,\r\nMichel Lefort",
    copro: "",
    attachments: [],
  },
  {
    id: "smp-4",
    from: "no-reply@notifications-banque.fr",
    to: ["compta@real31.fr"],
    subject: "Notification automatique : prelevement traite",
    receivedAt: "2026-06-16T06:00:00Z",
    bodyText: "Ceci est une notification automatique. Merci de ne pas repondre.",
    copro: "",
    attachments: [],
  },
];

export class SampleMailIngestionProvider implements MailIngestionProvider {
  async lireRecents(opts: OptionsIngestion): Promise<RawMail[]> {
    return ECHANTILLON.slice(0, opts.max);
  }
}
