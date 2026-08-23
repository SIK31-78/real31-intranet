// Service : genere le brouillon de reponse d'un mail A LA DEMANDE (jamais au
// chargement). On ne depense de l'IA que sur les mails reellement traites.
//
// 2026-08-23 : le mail est retrouve par une LECTURE LIVE des boites, plus dans le cache
// de triage -- ce cache n'est plus alimente depuis le passage en direct, s'y fier aurait
// rendu ce bouton muet ("Mail introuvable") sans que rien ne le signale.
// Passe par le routeur (ADR-001).

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getAnalyseMailProvider, getCoproRepository } from "@/lib/adapters/router";
import { construireBoites } from "@/lib/domain/boites-mail";
import { lireBoitesLive } from "@/lib/services/mes-emails/lire-boites";

/** Renvoie le brouillon propose (chaine vide si aucune reponse pertinente), null si le
 *  mail est introuvable dans les boites visibles. */
export async function genererBrouillonMail(g: Gestionnaire, emailId: string): Promise<string | null> {
  const boites = construireBoites(g.email, process.env.MAIL_BOITES_PARTAGEES);
  const copros = await getCoproRepository().list(g.id);
  const { mails } = await lireBoitesLive(g, boites, copros);
  const m = mails.find((x) => x.id === emailId);
  if (!m) return null;
  const p = await getAnalyseMailProvider().genererReponseEtPlan(
    { de: m.expediteurEmail, objet: m.objet, corps: m.corps },
    m.rattachement?.dossierLabel ?? m.objet,
  );
  return p.reponse;
}
