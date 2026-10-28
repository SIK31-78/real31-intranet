// Gardes de boîte de l'écran E-mails, partagées par les actions serveur et les routes
// (aperçu et dépôt des pièces jointes, REA-421, 27/10/2026). Hors du fichier « use server » :
// tout ce qu'il exporte deviendrait un point d'entrée public.
//
// L'adresse de boîte arrive du CLIENT (le mail affiché, le "De :" choisi). Elle n'est JAMAIS
// crue sur parole : seule une boîte de la configuration visible est acceptée. Absente => boîte
// personnelle, c'est-à-dire le comportement d'avant le multi-boîtes. Boîte partagée = celle de
// MON agence (config MAIL_TRI_BOITES) ; toutes pour un super-admin. Délégation de portefeuille
// active (complément d'ADR-041, 27/10/2026) : la boîte perso du titulaire est une boîte visible
// comme la mienne (hors incarnation), donc acceptée ici, et seulement avec la délégation.

import "server-only";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { estSuperAdmin } from "@/lib/auth/roles";
import { incarnationEnCours } from "@/lib/auth/session";
import { boiteAutorisee } from "@/lib/domain/boites-mail";
import { boitesVisibles, mailDistribue } from "@/lib/services/mes-emails/boites-visibles";

/**
 * `id` : celui de la personne, pour ses délégations de portefeuille (complément d'ADR-041).
 * `role` : un COMPTABLE lit « Comptabilité » de toutes les boîtes triées, et rien d'autre dans
 * une boîte partagée (28/10/2026, cf. boites-visibles).
 */
export type Personne = Pick<Gestionnaire, "id" | "email" | "agencyId" | "role">;

/**
 * Les boites de la personne : la sienne, celle de son agence (toutes pour un super-admin). En
 * incarnation, sans la boite perso : une action ne peut pas lire ni ecrire dans la messagerie
 * de la personne incarnee, meme appelee directement (27/10/2026).
 */
export async function boitesDe(g: Personne) {
  return boitesVisibles(g, { superAdmin: estSuperAdmin(g.email), sansBoitePerso: await incarnationEnCours() });
}

export async function boiteCible(g: Personne, demandee: string | undefined): Promise<string | null> {
  return cibleParmi(await boitesDe(g), demandee);
}

function cibleParmi(boites: Awaited<ReturnType<typeof boitesDe>>, demandee: string | undefined): string | null {
  const cible =
    (demandee ?? "").trim().toLowerCase() || boites.find((b) => b.personnelle && !b.pour)?.id || "";
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
  const boites = await boitesDe(g);
  const cible = cibleParmi(boites, demandee);
  if (!cible) return null;
  // Une boite perso (la mienne, ou celle d'un titulaire qui m'a confie son portefeuille) n'est
  // dans les boites visibles que hors incarnation : tout son contenu m'est ouvert.
  if (boites.find((b) => b.id === cible)?.personnelle || estSuperAdmin(g.email)) return cible;
  return (await mailDistribue(g, cible, emailId)) ? cible : null;
}

/**
 * La nature d'une boite visible : « mienne » (ma boite perso), « deleguee » (la boite perso
 * d'un titulaire, par delegation de portefeuille), « partagee », ou null (pas visible). Les
 * envois depuis une boite perso, la mienne ou celle du titulaire, partent comme depuis « Ma
 * boite » ; la corbeille et la creation de dossiers restent a ma seule boite.
 */
export async function natureBoite(g: Personne, cible: string | null | undefined): Promise<"mienne" | "deleguee" | "partagee" | null> {
  const b = cible ? (await boitesDe(g)).find((x) => x.id === cible.trim().toLowerCase()) : undefined;
  if (!b) return null;
  if (!b.personnelle) return "partagee";
  return b.pour ? "deleguee" : "mienne";
}

/**
 * La boîte PARTAGÉE d'un mail sur lequel on agit pour le déplacer (« Pas pour moi », bascule,
 * « Comptabilité ») : une boîte partagée que la personne voit, et le mail est distribué à l'un
 * de ses binômes (super-admin exempté) ; null sinon (boîte perso, boîte inconnue, mail d'un
 * autre binôme).
 */
export async function boitePartageeDe(g: Personne, boite: string | undefined, emailId: string): Promise<string | null> {
  const demandee = (boite ?? "").trim().toLowerCase();
  const b = (await boitesDe(g)).find((x) => x.id === demandee);
  if (!b || b.personnelle) return null;
  return estSuperAdmin(g.email) || (await mailDistribue(g, b.id, emailId)) ? b.id : null;
}
