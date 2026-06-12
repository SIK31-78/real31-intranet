"use server";

import { revalidatePath } from "next/cache";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { reporterSupervisionSansDate } from "@/lib/services/supervision-ag/reporter-sans-date";
import { reporterOdjSansDate } from "@/lib/services/odj/saisir-champ-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";

// Modifie la prochaine date d'AG / CS (ecrit dans public.Copropriete, partage App A).
// Cloisonne : le scope managerId est applique dans l'adapter (n'agit que sur ses copros).
async function definir(coproCode: string, type: "ag" | "cs", dateISO: string): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  await definirDateEvenement(coproCode, type, dateISO || null, g.id);
  // (Re)fixer une date d'AG reporte les prepas "sans date" (supervision + ODJ).
  if (type === "ag" && dateISO) {
    await reporterSupervisionSansDate(coproCode, dateISO);
    await reporterOdjSansDate(coproCode, dateISO);
  }
  revalidatePath(`/copropriete/${coproCode}`);
}

export async function definirDateAg(coproCode: string, dateISO: string): Promise<void> {
  await definir(coproCode, "ag", dateISO);
}
export async function definirDateCs(coproCode: string, dateISO: string): Promise<void> {
  await definir(coproCode, "cs", dateISO);
}
