// Service : genere le brouillon de reponse d'un mail A LA DEMANDE (plus au sync).
// On ne depense de l'IA que sur les mails reellement traites. Lit le mail dans le cache
// de triage du gestionnaire puis appelle l'IA d'analyse. Passe par le routeur (ADR-001).

import { getAnalyseMailProvider, getMesEmailsTriageStore } from "@/lib/adapters/router";

/** Renvoie le brouillon propose (chaine vide si aucune reponse pertinente), null si le
 *  mail est introuvable dans le triage. */
export async function genererBrouillonMail(gestionnaireId: string, emailId: string): Promise<string | null> {
  const triage = await getMesEmailsTriageStore().lire(gestionnaireId);
  const m = triage.mails.find((x) => x.id === emailId);
  if (!m) return null;
  const p = await getAnalyseMailProvider().genererReponseEtPlan(
    { de: m.expediteurEmail, objet: m.objet, corps: m.corps },
    m.rattachement?.dossierLabel ?? m.objet,
  );
  return p.reponse;
}
