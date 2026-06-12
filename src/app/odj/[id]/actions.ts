"use server";

import { revalidatePath } from "next/cache";
import {
  saisirChampOdj,
  retirerPointOdj,
} from "@/lib/services/odj/saisir-champ-odj";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

function parse(id: string): { code: string; agDate: string } {
  const i = id.indexOf("__");
  return i < 0 ? { code: id, agDate: ODJ_SANS_DATE } : { code: id.slice(0, i), agDate: id.slice(i + 2) };
}

/** Gestionnaire courant s'il est autorise sur cette copro, sinon null (cloisonnement). */
async function autorise(code: string): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  if (process.env.COPRO_SOURCE !== "supabase") return g;
  return (await coproAppartient(code, g.id)) ? g : null;
}

export async function saisirChampAction(id: string, champId: string, valeur: string): Promise<void> {
  const { code, agDate } = parse(id);
  const g = await autorise(code);
  if (!g) return;
  await saisirChampOdj(code, agDate, champId, valeur, g.initiales);
  revalidatePath(`/odj/${id}`);
}

export async function togglePointAction(id: string, pointId: string, retire: boolean): Promise<void> {
  const { code, agDate } = parse(id);
  const g = await autorise(code);
  if (!g) return;
  await retirerPointOdj(code, agDate, pointId, retire, g.initiales);
  revalidatePath(`/odj/${id}`);
}
