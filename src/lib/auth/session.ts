// Session "gestionnaire courant" (cloisonnement). Deux modes :
//  - SSO Microsoft Entra ID actif (identifiants Azure presents) : l'identite vient
//    de la session Auth.js (email) -> resolution du gestionnaire dans public."User".
//  - sinon (dev) : selecteur dev-login (cookie gid), defaut = premier gestionnaire.
// Le cloisonnement (filtrage par managerId) reste applique cote service/adapter.

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

/** Email de la session SSO (null si SSO inactif ou non connecte). */
async function emailSso(): Promise<string | null> {
  if (!ssoConfigure) return null;
  const session = await auth();
  return session?.user?.email ?? null;
}

/** Le user courant peut-il incarner un autre gestionnaire (selecteur /dev-login) ? */
export async function impersonationAutorisee(): Promise<boolean> {
  if (!ssoConfigure) return true; // mode dev sans SSO : selecteur libre
  return estSuperAdmin(await emailSso()); // SSO actif : seulement super-admin (apres login)
}

export async function getGestionnaireCourant(): Promise<Gestionnaire | null> {
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

  // Fallback dev sans SSO : premier gestionnaire.
  const tous = await repo.list();
  return tous[0] ?? null;
}
