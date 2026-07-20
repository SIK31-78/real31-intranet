"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_GESTIONNAIRE, impersonationAutorisee } from "@/lib/auth/session";
import { signIn, signOut, ssoConfigure } from "@/auth";

/**
 * Selectionne le gestionnaire courant (session dev) et redirige vers la RACINE : le
 * routage par role est centralise dans app/page.tsx (une comptable -> /comptabilite,
 * les autres -> /dashboard). Le cookie est pose AVANT le redirect, donc la racine
 * resout deja le bon role.
 */
export async function choisirGestionnaire(id: string): Promise<void> {
  // Garde cote action : une Server Action est un endpoint POST appelable directement,
  // on ne se fie pas au rendu de la page. Seul un super-admin (SSO actif) ou le mode dev
  // sans SSO peut incarner un autre gestionnaire (audit prod 2026-06-25).
  if (!(await impersonationAutorisee())) {
    redirect("/dev-login");
  }
  (await cookies()).set(COOKIE_GESTIONNAIRE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

/** Lance le login SSO Microsoft Entra ID (routage par role a la racine). */
export async function connecterMicrosoft(): Promise<void> {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

/** Deconnexion : efface l'impersonation (cookie gid) puis ferme la session SSO. */
export async function deconnecter(): Promise<void> {
  (await cookies()).delete(COOKIE_GESTIONNAIRE);
  if (ssoConfigure) {
    await signOut({ redirectTo: "/dev-login" });
  } else {
    redirect("/dev-login");
  }
}
