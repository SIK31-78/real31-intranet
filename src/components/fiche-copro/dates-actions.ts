"use server";

import { revalidatePath } from "next/cache";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { reporterSupervisionSansDate } from "@/lib/services/supervision-ag/reporter-sans-date";
import { reporterOdjSansDate } from "@/lib/services/odj/saisir-champ-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";

// Modifie une date d'AG / CS (ecrit dans public.Copropriete, partage App A).
// `quand` = prochaine (planifiee) ou derniere (tenue, correction du referentiel App A).
// Cloisonne : le scope managerId est applique dans l'adapter (n'agit que sur ses copros).
async function definir(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string,
): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  await definirDateEvenement(coproCode, type, quand, dateISO || null, g.id);
  // (Re)fixer la PROCHAINE date d'AG reporte les prepas "sans date" (supervision + ODJ).
  // Corriger la derniere AG tenue est une mise a jour du referentiel : pas de report.
  if (type === "ag" && quand === "prochaine" && dateISO) {
    await reporterSupervisionSansDate(coproCode, dateISO);
    await reporterOdjSansDate(coproCode, dateISO);
  }
  // Changer une date recalcule les jalons : revalider TOUTES les vues qui les affichent
  // (sinon le calendrier / dashboard / Actions restent sur l'ancien calcul).
  revalidatePath(`/copropriete/${coproCode}`);
  revalidatePath("/calendrier");
  revalidatePath("/dashboard");
  revalidatePath("/mes-evenements");
}

export async function definirDateAg(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
): Promise<void> {
  await definir(coproCode, "ag", quand, dateISO);
}
export async function definirDateCs(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
): Promise<void> {
  await definir(coproCode, "cs", quand, dateISO);
}
