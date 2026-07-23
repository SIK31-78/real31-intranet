"use server";

// Server Actions du panneau /admin/feedback. RESERVEES SUPER-ADMIN (garde serveur a
// chaque action : le masquage UI ne protege rien). Validation zod. Le changement de
// statut passe par le service (transition validee par le domaine, livre_at pose) ;
// l'edition (titre/priorite/note) passe par le routeur (comme /admin/cles-api).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { getFeedbackRepository } from "@/lib/adapters/router";
import { changerStatutFeedback } from "@/lib/services/feedback/changer-statut";
import { STATUTS_FEEDBACK, type StatutFeedback } from "@/lib/domain/feedback";

async function exigerSuperAdmin(): Promise<{ ok: true; par: string } | { ok: false; message: string }> {
  const g = await getGestionnaireCourant();
  if (!g || !estSuperAdmin(g.email)) return { ok: false, message: "Action réservée au super-admin." };
  return { ok: true, par: g.email ?? g.initiales };
}

const zStatut = z.object({
  id: z.string().trim().min(1).max(120),
  statut: z.enum(STATUTS_FEEDBACK as unknown as [StatutFeedback, ...StatutFeedback[]]),
  raisonEcart: z.string().trim().min(1).max(500).optional(),
});

export async function changerStatutAction(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = zStatut.safeParse(input);
  if (!parse.success) return { ok: false, message: "Saisie invalide." };
  const { id, statut, raisonEcart } = parse.data;

  const r = await changerStatutFeedback(id, statut, {
    par: garde.par,
    ...(raisonEcart ? { raisonEcart } : {}),
  });
  if (!r.ok) {
    const message =
      r.refus === "raison_ecart_requise"
        ? "Écarter une remontée exige une raison."
        : r.refus === "transition_interdite"
          ? "Cette transition de statut n'est pas permise."
          : "Remontée introuvable.";
    return { ok: false, message };
  }
  revalidatePath("/admin/feedback");
  revalidatePath("/nouveautes");
  return { ok: true };
}

const zEdition = z
  .object({
    id: z.string().trim().min(1).max(120),
    titre: z.string().trim().min(1).max(120).optional(),
    // null efface la priorite ; absent = ne pas toucher.
    priorite: z.number().int().min(0).max(9999).nullable().optional(),
    noteInterne: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.titre !== undefined || v.priorite !== undefined || v.noteInterne !== undefined, {
    message: "Rien à modifier.",
  });

export async function editerFeedbackAction(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = zEdition.safeParse(input);
  if (!parse.success) return { ok: false, message: parse.error.issues[0]?.message ?? "Saisie invalide." };
  const { id, titre, priorite, noteInterne } = parse.data;

  const maj = await getFeedbackRepository().patch(id, {
    ...(titre !== undefined ? { titre } : {}),
    ...(priorite !== undefined ? { priorite } : {}),
    ...(noteInterne !== undefined ? { noteInterne } : {}),
  });
  if (!maj) return { ok: false, message: "Remontée introuvable." };
  revalidatePath("/admin/feedback");
  revalidatePath("/nouveautes");
  return { ok: true };
}
