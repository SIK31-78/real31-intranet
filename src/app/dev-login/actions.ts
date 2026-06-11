"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_GESTIONNAIRE } from "@/lib/auth/session";

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
