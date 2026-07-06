// Session "gestionnaire courant" (cloisonnement). Deux modes :
//  - SSO Microsoft Entra ID actif (identifiants Azure presents) : l'identite vient
//    de la session Auth.js (email) -> resolution du gestionnaire dans public."User".
//  - sinon (dev) : selecteur dev-login (cookie gid), defaut = premier gestionnaire.
// Le cloisonnement (filtrage par managerId) reste applique cote service/adapter.

import { cache } from "react";
import { cookies } from "next/headers";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getGestionnaireRepository } from "@/lib/adapters/router";
import { auth, ssoConfigure } from "@/auth";

export const COOKIE_GESTIONNAIRE = "gid";

// Impersonation : se mettre dans la peau de n'importe quel gestionnaire via le cookie
// gid (selecteur /dev-login). Quand le SSO est actif, l'auth Microsoft passe TOUJOURS
// en premier ; seul un SUPER-ADMIN (email allowliste) peut ensuite changer de gestionnaire.
// Sans SSO (dev pur) : selecteur libre. Un gestionnaire normal reste cloisonne a son compte.
const SUPER_ADMINS = (process.env.SUPER_ADMINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function estSuperAdmin(email: string | null | undefined): boolean {
  return Boolean(email && SUPER_ADMINS.includes(email.toLowerCase()));
}

// "Mes evenements" (boite mail Graph) n'apparait QUE si la vraie boite est branchee
// (MAIL_SOURCE=graph). En prod, tant que le module n'est pas pret, MAIL_SOURCE n'est
// pas defini -> l'entree est grisee (et l'acces direct redirige). Tout le dev mail se
// fait en local (ou MAIL_SOURCE=graph) jusqu'a ce que ce soit OK pour la prod.
export function mailModuleActif(): boolean {
  return process.env.MAIL_SOURCE === "graph";
}

/** Email de la session SSO (null si SSO inactif ou non connecte). Memoise par requete
 *  (React.cache) -> auth() n'est lu qu'une fois par rendu, pas a chaque appel. */
const emailSso = cache(async (): Promise<string | null> => {
  if (!ssoConfigure) return null;
  const session = await auth();
  return session?.user?.email ?? null;
});

/** Le user courant peut-il incarner un autre gestionnaire (selecteur /dev-login) ? */
export async function impersonationAutorisee(): Promise<boolean> {
  if (!ssoConfigure) return true; // mode dev sans SSO : selecteur libre
  return estSuperAdmin(await emailSso()); // SSO actif : seulement super-admin (apres login)
}

// Memoise par requete (React.cache) : appele dans la page ET dans AppShell -> une seule
// resolution (auth() + requete DB User) par rendu serveur au lieu de plusieurs.
export const getGestionnaireCourant = cache(async (): Promise<Gestionnaire | null> => {
  const repo = getGestionnaireRepository();
  const email = await emailSso();

  // Impersonation (super-admin connecte, ou mode sans SSO) : le cookie gid prime. Un
  // super-admin doit etre LOGGE en SSO (email) pour etre reconnu -> le SSO passe d'abord.
  if (!ssoConfigure || estSuperAdmin(email)) {
    const id = (await cookies()).get(COOKIE_GESTIONNAIRE)?.value;
    if (id) {
      const g = await repo.findById(id);
      if (g) return g;
    }
  }

  // SSO actif : le gestionnaire reel par email (null = non connecte -> /dev-login).
  if (ssoConfigure) {
    if (!email) return null;
    const g = await repo.findByEmail(email);
    return g ? { ...g, email } : null;
  }

  // Fallback dev sans SSO : premier gestionnaire. JAMAIS en production : un deploiement
  // sans SSO configure servirait sinon toutes les routes a des ANONYMES sous l'identite
  // d'un gestionnaire reel. En prod on retourne null (l'appelant renvoie 401 / redirige).
  if (process.env.NODE_ENV === "production") return null;
  const tous = await repo.list();
  return tous[0] ?? null;
});
