"use server";

import { revalidatePath } from "next/cache";
import type { StatutItem } from "@/lib/domain/supervision-ag";
import {
  cocherItem,
  commenterItem,
} from "@/lib/services/supervision-ag/mettre-a-jour-item";
import { conclureAg } from "@/lib/services/supervision-ag/conclure-ag";

// Mock session : auditeur courant = EL. A remplacer par session reelle plus tard.
const AUDITEUR = { initiales: "EL" };

export async function cocherItemAction(
  agId: string,
  itemId: string,
  statut: StatutItem,
): Promise<void> {
  await cocherItem(agId, itemId, statut, AUDITEUR);
  revalidatePath(`/supervision-ag/${agId}`);
}

export async function commenterItemAction(
  agId: string,
  itemId: string,
  commentaire: string,
): Promise<void> {
  await commenterItem(agId, itemId, commentaire, AUDITEUR);
  revalidatePath(`/supervision-ag/${agId}`);
}

export async function conclureAgAction(agId: string): Promise<void> {
  const visa = {
    initiales: AUDITEUR.initiales,
    le: new Date().toLocaleDateString("fr-FR"),
  };
  await conclureAg(agId, visa);
  revalidatePath(`/supervision-ag/${agId}`);
}
