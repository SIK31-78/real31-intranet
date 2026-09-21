"use server";

// Changer de vue (ADR-041) : le cookie, puis les pages qui listent se rafraichissent.

import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { ecrireVueChoisie } from "@/lib/auth/vue-perimetre";
import { vueEffective } from "@/lib/domain/perimetre-ecriture";
import { vuesDisponibles } from "@/lib/services/coproprietes/vue-perimetre";
import type { Res } from "@/lib/actions/resultat";

export async function choisirVueAction(vue: unknown): Promise<Res> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  const { vues } = await vuesDisponibles(g.id, estSuperAdmin(g.email));
  await ecrireVueChoisie(vueEffective(typeof vue === "string" ? vue : null, vues));
  revalidatePath("/accueil");
  revalidatePath("/copropriete");
  return { ok: true };
}
