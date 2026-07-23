"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { JalonCode } from "@/lib/domain/jalons-ag/types";
import { marquerJalon } from "@/lib/services/jalons/marquer-jalon";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";

const zEntree = z.object({
  coproCode: z.string().trim().min(1).max(40),
  agDate: z.string().trim().min(1).max(40),
  jalonCode: z.string().trim().min(1).max(60),
});

// Confirme depuis le dashboard qu'une echeance passee est bien faite (convoc envoyee,
// ODJ pret...) : marque le jalon "accompli" dans intranet_jalons -> il passe en vert et
// sort des "a confirmer". Cloisonne : n'agit que sur une copro du gestionnaire.
export async function confirmerJalonAction(
  coproCode: string,
  agDate: string,
  jalonCode: JalonCode,
): Promise<void> {
  if (!zEntree.safeParse({ coproCode, agDate, jalonCode }).success) return;
  const g = await getGestionnaireCourant();
  if (!g) return;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return;
  await marquerJalon({ coproCode, agDate, type: jalonCode, statut: "accompli", par: g.initiales }, g.id);
  revalidatePath("/accueil");
  revalidatePath(`/supervision-ag/${coproCode}__${agDate}`);
}
