"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_GESTIONNAIRE } from "@/lib/auth/session";
import { signIn, signOut, ssoConfigure } from "@/auth";

/** Selectionne le gestionnaire courant (session dev) et redirige vers le dashboard. */
export async function choisirGestionnaire(id: string): Promise<void> {
  (await cookies()).set(COOKIE_GESTIONNAIRE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/dashboard");
}

/** Lance le login SSO Microsoft Entra ID. */
export async function connecterMicrosoft(): Promise<void> {
  await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
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
