"use server";

import { revalidatePath } from "next/cache";
import { confirmerPriseEnMain } from "@/lib/services/coproprietes/prise-en-main";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";

// Onboarding : le gestionnaire confirme avoir verifie/corrige les dates d'une copro.
// Cloisonne : n'agit que sur une copro de son perimetre.
async function confirmer(coproCode: string): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return;
  await confirmerPriseEnMain(coproCode, g.initiales);
}

export async function prendreEnMainAction(coproCode: string): Promise<void> {
  await confirmer(coproCode);
  revalidatePath("/copropriete");
  revalidatePath("/accueil");
}

export async function prendreEnMainLotAction(coproCodes: string[]): Promise<void> {
  for (const code of coproCodes) await confirmer(code);
  revalidatePath("/copropriete");
  revalidatePath("/accueil");
}
