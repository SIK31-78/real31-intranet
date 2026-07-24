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
import { estSuperAdmin } from "./roles";

export const COOKIE_GESTIONNAIRE = "gid";

// Impersonation : se mettre dans la peau de n'importe quel gestionnaire via le cookie
// gid (selecteur /dev-login). Quand le SSO est actif, l'auth Microsoft passe TOUJOURS
// en premier ; seul un SUPER-ADMIN (email allowliste SUPER_ADMINS) peut ensuite changer de
// gestionnaire. Sans SSO (dev pur) : selecteur libre. Un gestionnaire normal reste cloisonne.
//
// Le role vit desormais dans lib/auth/roles.ts (LE point de verite des roles) ; on le
// re-exporte ici pour les appelants historiques (import depuis @/lib/auth/session).
export { estSuperAdmin };

// Gates du module mail : extraits dans lib/domain/mail-gate.ts (PUR, aucune dep next-auth
// ni auth -- regle metier de rollout) pour etre importables depuis les services sans casser
// les tests ni la regle ESLint boundaries. On les re-exporte ici pour la retro-compat de
// tous les appelants historiques (import "@/lib/auth/session").
export { mailModuleActif, mailModuleActifPour } from "@/lib/domain/mail-gate";

/** Email de la session SSO (null si SSO inactif ou non connecte). Memoise par requete
 *  (React.cache) -> auth() n'est lu qu'une fois par rendu, pas a chaque appel. */
const emailSso = cache(async (): Promise<string | null> => {
  if (!ssoConfigure) return null;
  const session = await auth();
  return session?.user?.email ?? null;
});

/**
 * Decision PURE de l'impersonation (env passe en arguments explicites -> testable offline).
 *
 *  - SSO actif  : seul un super-admin CONNECTE peut incarner un autre gestionnaire.
 *  - Sans SSO   : selecteur libre... mais UNIQUEMENT en dev. Un deploiement de PRODUCTION
 *    sans SSO configure n'a AUCUNE identite verifiee (le seul mur est le mot de passe Basic
 *    partage du proxy) ; y ouvrir l'impersonation reviendrait a laisser n'importe qui se
 *    mettre dans la peau de n'importe quel gestionnaire (fail-open). En prod sans SSO on
 *    REFUSE donc (fail-closed) - le deploiement doit passer par le SSO Entra ID.
 */
export function impersonationAutoriseePure(params: {
  ssoConfigure: boolean;
  nodeEnv: string | undefined;
  estSuperAdmin: boolean;
}): boolean {
  const { ssoConfigure: sso, nodeEnv, estSuperAdmin: superAdmin } = params;
  if (!sso) return nodeEnv !== "production";
  return superAdmin;
}

/** Le user courant peut-il incarner un autre gestionnaire (selecteur /dev-login) ? */
export async function impersonationAutorisee(): Promise<boolean> {
  return impersonationAutoriseePure({
    ssoConfigure,
    nodeEnv: process.env.NODE_ENV,
    estSuperAdmin: estSuperAdmin(await emailSso()),
  });
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
