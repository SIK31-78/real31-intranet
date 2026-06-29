"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { marquerJalon as marquerJalonService } from "@/lib/services/jalons/marquer-jalon";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";
import type { JalonCode, StatutJalon } from "@/lib/domain/jalons-ag/types";

const zEntree = z.object({
  coproCode: z.string().trim().min(1).max(40),
  agDate: z.string().trim().min(1).max(40),
  type: z.string().trim().min(1).max(60),
  statut: z.string().trim().min(1).max(40),
});

/** Marque un jalon d'AG (ecrit dans intranet_jalons) et rafraichit la fiche.
 *  Cloisonne : refuse silencieusement si la copro n'appartient pas au gestionnaire. */
export async function marquerJalon(
  coproCode: string,
  agDate: string,
  type: JalonCode,
  statut: StatutJalon,
): Promise<void> {
  if (!zEntree.safeParse({ coproCode, agDate, type, statut }).success) return;
  const g = await getGestionnaireCourant();
  if (!g) return;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return; // hors scope
  }
  await marquerJalonService({ coproCode, agDate, type, statut, par: g.initiales });
  revalidatePath(`/copropriete/${coproCode}`);
}
