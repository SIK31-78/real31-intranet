"use server";

import { revalidatePath } from "next/cache";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { getGestionnaireCourant } from "@/lib/auth/session";

// Modifie la prochaine date d'AG / CS (ecrit dans public.Copropriete, partage App A).
// Cloisonne : le scope managerId est applique dans l'adapter (n'agit que sur ses copros).
async function definir(coproCode: string, type: "ag" | "cs", dateISO: string): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  await definirDateEvenement(coproCode, type, dateISO || null, g.id);
  revalidatePath(`/copropriete/${coproCode}`);
}

export async function definirDateAg(coproCode: string, dateISO: string): Promise<void> {
  await definir(coproCode, "ag", dateISO);
}
export async function definirDateCs(coproCode: string, dateISO: string): Promise<void> {
  await definir(coproCode, "cs", dateISO);
}
