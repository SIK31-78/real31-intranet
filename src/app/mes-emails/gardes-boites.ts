// Gardes de boîte de l'écran E-mails, partagées par les actions serveur et les routes
// (aperçu et dépôt des pièces jointes, REA-421, 27/10/2026). Hors du fichier « use server » :
// tout ce qu'il exporte deviendrait un point d'entrée public.
//
// L'adresse de boîte arrive du CLIENT (le mail affiché, le "De :" choisi). Elle n'est JAMAIS
// crue sur parole : seule une boîte de la configuration visible est acceptée. Absente => boîte
// personnelle, c'est-à-dire le comportement d'avant le multi-boîtes. Boîte partagée = celle de
// MON agence (config MAIL_TRI_BOITES) ; toutes pour un super-admin.

import "server-only";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { estSuperAdmin } from "@/lib/auth/roles";
import { incarnationEnCours } from "@/lib/auth/session";
import { boiteAutorisee } from "@/lib/domain/boites-mail";
import { boitesVisibles, mailDistribue } from "@/lib/services/mes-emails/boites-visibles";

export type Personne = Pick<Gestionnaire, "email" | "agencyId">;

/**
 * Les boites de la personne : la sienne, celle de son agence (toutes pour un super-admin). En
 * incarnation, sans la boite perso : une action ne peut pas lire ni ecrire dans la messagerie
 * de la personne incarnee, meme appelee directement (27/10/2026).
 */
export async function boitesDe(g: Personne) {
  return boitesVisibles(g, { superAdmin: estSuperAdmin(g.email), sansBoitePerso: await incarnationEnCours() });
}

export async function boiteCible(g: Personne, demandee: string | undefined): Promise<string | null> {
  const boites = await boitesDe(g);
  const cible =
    (demandee ?? "").trim().toLowerCase() || boites.find((b) => b.personnelle)?.id || "";
  if (!cible) return null;
  return boiteAutorisee(boites, cible) ? cible : null;
}

/**
 * La boite d'un MAIL RECU sur lequel on agit (isolation par binome, 27/10/2026) : la boite doit
 * etre visible (boiteCible), et dans une boite partagee le mail doit avoir ete distribue par
 * le tri a l'un de MES binomes. Sinon un identifiant de mail pris chez un autre binome (ou
 * fabrique) ouvrirait ses pieces jointes, son historique, une reponse en son nom. Le
 * super-admin en est exempte (pilote). La distribution est lue une fois par requete.
 */
export async function boiteDuMail(g: Personne, demandee: string | undefined, emailId: string): Promise<string | null> {
  const cible = await boiteCible(g, demandee);
  if (!cible) return null;
  if (cible === (g.email ?? "").trim().toLowerCase() || estSuperAdmin(g.email)) return cible; // la boite perso n'est dans boiteCible que hors incarnation
  return (await mailDistribue(g, cible, emailId)) ? cible : null;
}
