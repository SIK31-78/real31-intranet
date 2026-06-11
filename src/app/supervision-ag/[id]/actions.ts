"use server";

import { revalidatePath } from "next/cache";
import type { StatutItem } from "@/lib/domain/supervision-ag";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import {
  cocherItem,
  commenterItem,
} from "@/lib/services/supervision-ag/mettre-a-jour-item";
import { conclureAg } from "@/lib/services/supervision-ag/conclure-ag";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { ITEM_CS_PREPA } from "@/lib/domain/supervision-ag-template";

// L'id de supervision est "CODE__DATE" en reel ; en mock c'est un id simple (e1).
function codeDe(agId: string): string {
  const i = agId.indexOf("__");
  return i < 0 ? agId : agId.slice(0, i);
}

/** Gestionnaire courant s'il est autorise sur cette supervision, sinon null. */
async function autorise(agId: string): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  if (process.env.COPRO_SOURCE !== "supabase") return g; // pas de cloisonnement en mock
  return (await coproAppartient(codeDe(agId), g.id)) ? g : null;
}

export async function cocherItemAction(
  agId: string,
  itemId: string,
  statut: StatutItem,
): Promise<void> {
  const g = await autorise(agId);
  if (!g) return;
  await cocherItem(agId, itemId, statut, { initiales: g.initiales });
  revalidatePath(`/supervision-ag/${agId}`);
}

export async function commenterItemAction(
  agId: string,
  itemId: string,
  commentaire: string,
): Promise<void> {
  const g = await autorise(agId);
  if (!g) return;
  await commenterItem(agId, itemId, commentaire, { initiales: g.initiales });
  // Le "CS preparatoire le" alimente la date de prochain CS de la copro (calendrier).
  if (itemId === ITEM_CS_PREPA) {
    const code = codeDe(agId);
    await definirDateEvenement(code, "cs", commentaire || null, g.id);
    revalidatePath(`/copropriete/${code}`);
    revalidatePath("/calendrier");
  }
  revalidatePath(`/supervision-ag/${agId}`);
}

export async function conclureAgAction(agId: string): Promise<void> {
  const g = await autorise(agId);
  if (!g) return;
  await conclureAg(agId, {
    initiales: g.initiales,
    le: new Date().toLocaleDateString("fr-FR"),
  });
  revalidatePath(`/supervision-ag/${agId}`);
}
