// Service : le corps COMPLET d'un mail, a la demande (a l'ouverture). La liste ne porte
// qu'un extrait : la boite entiere serialisee au client pesait autant que tous les mails
// (audit du 16/09/2026). Meme source que le brouillon IA : le triage du gestionnaire, puis
// le fournisseur en repli (archive / mock). Passe par le routeur (ADR-001).

import { getMesEmailsProvider, getMesEmailsTriageStore } from "@/lib/adapters/router";

/** Le corps du mail, ou null s'il est introuvable. */
export async function lireCorpsMail(gestionnaireId: string, emailId: string): Promise<string | null> {
  const triage = await getMesEmailsTriageStore().lire(gestionnaireId);
  const m = triage.mails.find((x) => x.id === emailId);
  if (m) return m.corps;
  const repli = await getMesEmailsProvider().getMesEmails(gestionnaireId);
  return repli.mails.find((x) => x.id === emailId)?.corps ?? null;
}
