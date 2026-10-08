// Binomes du tri des e-mails (ADR-046) : ESTALE donne le gestionnaire de chaque copro,
// l'intranet tient son assistant. Changer l'assistant ne deplace aucun mail : le dossier
// du binome sera renomme au prochain rangement (sa cle reste le gestionnaire).

import type { MembreTri } from "@/lib/domain/tri-emails";
import { getGestionnaireRepository, getReferentielTriProvider, getTriRepository } from "@/lib/adapters/router";

/** Un collaborateur qu'on peut designer comme assistant. */
export interface Collaborateur extends MembreTri {
  initiales: string;
}

export async function listerCollaborateurs(): Promise<Collaborateur[]> {
  const tous = await getGestionnaireRepository().listTous();
  return tous
    .filter((g): g is typeof g & { email: string } => Boolean(g.email))
    .map((g) => ({ nomComplet: g.nomComplet, email: g.email.trim().toLowerCase(), initiales: g.initiales }))
    .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, "fr"));
}

export async function definirBinome(emailGestionnaire: string, emailAssistant: string, par: string): Promise<void> {
  const g = emailGestionnaire.trim().toLowerCase();
  const a = emailAssistant.trim().toLowerCase();
  if (g === a) throw new Error("Le gestionnaire ne peut pas être son propre assistant.");
  const [ref, collaborateurs] = await Promise.all([getReferentielTriProvider().charger(), listerCollaborateurs()]);
  if (!ref.copros.some((c) => c.gestionnaire?.email.trim().toLowerCase() === g)) {
    throw new Error("Ce gestionnaire n'a aucune copropriété ESTALE.");
  }
  const assistant = collaborateurs.find((c) => c.email === a);
  if (!assistant) throw new Error("Collaborateur introuvable dans l'intranet.");
  await getTriRepository().definirBinome(g, { nomComplet: assistant.nomComplet, email: assistant.email }, par);
}

export async function retirerBinome(emailGestionnaire: string): Promise<void> {
  await getTriRepository().retirerBinome(emailGestionnaire);
}
