"use server";

import { revalidatePath } from "next/cache";
import { marquerJalon as marquerJalonService } from "@/lib/services/jalons/marquer-jalon";
import type { JalonCode, StatutJalon } from "@/lib/domain/jalons-ag/types";

/** Marque un jalon d'AG (ecrit dans intranet_jalons) et rafraichit la fiche. */
export async function marquerJalon(
  coproCode: string,
  agDate: string,
  type: JalonCode,
  statut: StatutJalon,
): Promise<void> {
  // par = initiales du gestionnaire ; en dur tant qu'il n'y a pas d'auth.
  await marquerJalonService({ coproCode, agDate, type, statut, par: "EL" });
  revalidatePath(`/copropriete/${coproCode}`);
}
