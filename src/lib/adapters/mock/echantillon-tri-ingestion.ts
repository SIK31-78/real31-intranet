// Echantillon FICTIF de la boite de reception generique (ADR-046), pour developper
// l'ecran de tri sans la vraie boite (MAIL_BOITE_TRI=echantillon). Adresses et noms
// inventes ; les codes S0297 / S0305 / SE999 existent dans ESTALE pour que la
// suggestion par code se voie aussi avec le vrai referentiel.

import type { MailIngestionProvider, OptionsIngestion } from "@/lib/ports/mail-ingestion-provider";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

const jour = new Date().toISOString().slice(0, 10);
const a = (heure: string) => `${jour}T${heure}:00Z`;

const mail = (id: number, p: Omit<RawMail, "id" | "internetMessageId" | "to" | "copro">): RawMail => ({
  id: `tri-${id}`,
  internetMessageId: `<tri-${id}@exemple.fr>`,
  to: ["tri@exemple.fr"],
  copro: "",
  ...p,
});

export const ECHANTILLON: RawMail[] = [
  mail(1, { from: "m.delmas@exemple.fr", fromName: "Marc Delmas", subject: "Infiltration plafond salle de bain, lot 14", receivedAt: a("06:12"),
    bodyText: "Bonjour,\nDepuis ce week-end, une tache d'humidité s'étend au plafond de ma salle de bain.\nPouvez-vous faire intervenir quelqu'un rapidement ?\nMarc Delmas",
    attachments: [{ name: "photo_plafond.jpg" }] }),
  mail(2, { from: "devis@plomberie-exemple.fr", fromName: "Plomberie Exemple", subject: "Devis D-2026-0918 remplacement colonne EF", receivedAt: a("06:40"),
    bodyText: "Madame, Monsieur,\nVeuillez trouver ci-joint notre devis pour le remplacement de la colonne d'eau froide, bâtiment B.",
    attachments: [{ name: "D-2026-0918.pdf" }] }),
  mail(3, { from: "presidente.cs@exemple.fr", fromName: "Hélène Roux", subject: "RE: [S0305] Ordre du jour du conseil syndical", receivedAt: a("07:05"),
    bodyText: "Bonjour,\nLe conseil souhaite ajouter un point sur l'éclairage du parking.\nHélène Roux", attachments: [] }),
  mail(4, { from: "julie.marchand@exemple.fr", fromName: "Julie Marchand", subject: "Question sur mon appel de fonds", receivedAt: a("08:02"),
    bodyText: "Bonjour,\nJe ne comprends pas le montant de mon dernier appel de fonds.\nPouvez-vous m'expliquer ?", attachments: [] }),
  mail(5, { from: "contact@ascenseurs-exemple.fr", fromName: "Ascenseurs Exemple", subject: "Rapport de visite trimestrielle", receivedAt: a("08:26"),
    bodyText: "Bonjour,\nVeuillez trouver le rapport de visite pour la résidence SE999.\nCordialement", attachments: [{ name: "rapport.pdf" }] }),
  mail(6, { from: "cs.lescedres@exemple.fr", fromName: "Syndicat Les Cèdres", subject: "Résiliation de votre mandat S0142", receivedAt: a("09:10"),
    bodyText: "Madame, Monsieur,\nNous vous informons de la décision de l'assemblée de changer de syndic.", attachments: [{ name: "PV_AG.pdf" }] }),
];

export class EchantillonTriIngestion implements MailIngestionProvider {
  async compterReception(): Promise<number> {
    return ECHANTILLON.length;
  }

  async lireRecents(opts: OptionsIngestion): Promise<RawMail[]> {
    return [...ECHANTILLON].reverse().slice(0, opts.max);
  }
}
