"use server";

import { revalidatePath } from "next/cache";
import type { JalonCode } from "@/lib/domain/jalons-ag/types";
import { marquerJalon } from "@/lib/services/jalons/marquer-jalon";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";

// Confirme depuis le dashboard qu'une echeance passee est bien faite (convoc envoyee,
// ODJ pret...) : marque le jalon "accompli" dans intranet_jalons -> il passe en vert et
// sort des "a confirmer". Cloisonne : n'agit que sur une copro du gestionnaire.
export async function confirmerJalonAction(
  coproCode: string,
  agDate: string,
  jalonCode: JalonCode,
): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return;
  await marquerJalon({ coproCode, agDate, type: jalonCode, statut: "accompli", par: g.initiales });
  revalidatePath("/dashboard");
  revalidatePath(`/supervision-ag/${coproCode}__${agDate}`);
}
