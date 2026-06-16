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

export async function getGestionnaireCourant(): Promise<Gestionnaire | null> {
  const repo = getGestionnaireRepository();

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
