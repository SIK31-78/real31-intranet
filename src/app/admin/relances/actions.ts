"use server";

// Server Actions de /admin/relances (module « Contrats & contrôles », REA-333, décision 10).
// RÉSERVÉES À LA DIRECTION : garde serveur dans l'action, le masquage dans l'écran ne protège
// rien. Les bornes métier sont vérifiées par le service (verifierRegle).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Refus, actionGestionnaire } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { MESSAGE_RESERVE_DIRECTION, estDirection, profilDe } from "@/lib/auth/roles";
import { SUJETS } from "@/lib/domain/contrats-copro";
import { modifierRegle } from "@/lib/services/contrats-copro/regles";

const zRegle = z
  .object({
    sujet: z.enum(SUJETS),
    premierRappelJours: z.number().int().min(1).max(730),
    orangeJours: z.number().int().min(1).max(365),
    rougeJours: z.number().int().min(2).max(730),
    cadenceJours: z.number().int().min(1).max(90),
  })
  .strict();

export async function modifierRegleAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zRegle, input, "admin/relances", async (regle, g) => {
    if (!estDirection(profilDe(g))) throw new Refus(MESSAGE_RESERVE_DIRECTION);
    await modifierRegle(regle, { id: g.id, nom: g.nomComplet, ...(g.email ? { email: g.email } : {}) });
    revalidatePath("/admin/relances");
    revalidatePath("/contrats-copro");
  });
}
