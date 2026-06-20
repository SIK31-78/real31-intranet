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

// Acces dev "impersonation" : en local (next dev) on peut se mettre dans la peau de
// n'importe quel gestionnaire via le cookie gid (selecteur /dev-login). JAMAIS en prod
// (NODE_ENV=production sur Vercel) : la, le SSO est seul maitre du cloisonnement.
export const devLoginActif = process.env.NODE_ENV !== "production";

export async function getGestionnaireCourant(): Promise<Gestionnaire | null> {
  const repo = getGestionnaireRepository();

  // DEV uniquement : un cookie gid (choisi via /dev-login) prime sur le SSO -> on peut
  // tester / demontrer en tant que n'importe quel gestionnaire. Inerte en prod.
  if (devLoginActif) {
    const id = (await cookies()).get(COOKIE_GESTIONNAIRE)?.value;
    if (id) {
      const g = await repo.findById(id);
      if (g) return g;
    }
  }

  // SSO actif : email de la session Microsoft -> gestionnaire (public."User").
  if (ssoConfigure) {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) return null; // non connecte -> les pages redirigent vers /dev-login
    return repo.findByEmail(email);
  }

  // Fallback dev : cookie gid, defaut = premier gestionnaire.
  const id = (await cookies()).get(COOKIE_GESTIONNAIRE)?.value;
  if (id) {
    const g = await repo.findById(id);
    if (g) return g;
  }
  const tous = await repo.list();
  return tous[0] ?? null;
}
