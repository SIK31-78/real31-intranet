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
// gid (selecteur /dev-login). Autorisee pour : le dev local (next dev), OU un SUPER-ADMIN
// (email allowliste, meme en prod SSO), OU le mode sans SSO. Un gestionnaire normal en
// prod SSO reste cloisonne a son seul compte.
export const devLoginActif = process.env.NODE_ENV !== "production";

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
  if (!ssoConfigure) return true; // mode dev sans SSO
  if (devLoginActif) return true; // dev local
  return estSuperAdmin(await emailSso()); // prod SSO : seulement super-admin
}

export async function getGestionnaireCourant(): Promise<Gestionnaire | null> {
  const repo = getGestionnaireRepository();
  const email = await emailSso();

  // Impersonation autorisee (dev local, super-admin, ou sans SSO) : le cookie gid prime.
  // IMPORTANT : avant le check SSO -> en dev on choisit un gestionnaire sans login Microsoft.
  if (!ssoConfigure || devLoginActif || estSuperAdmin(email)) {
    const id = (await cookies()).get(COOKIE_GESTIONNAIRE)?.value;
    if (id) {
      const g = await repo.findById(id);
      if (g) return g;
    }
  }

  // SSO actif : le gestionnaire reel par email (null = non connecte -> /dev-login).
  if (ssoConfigure) {
    if (!email) return null;
    return repo.findByEmail(email);
  }

  // Fallback dev sans SSO : premier gestionnaire.
  const tous = await repo.list();
  return tous[0] ?? null;
}
