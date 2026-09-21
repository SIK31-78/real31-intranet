"use server";

// Server Actions des delegations d'ecriture (ADR-041). Le droit de deleguer est verifie par
// le service (peutDeleguer) : le titulaire pour lui-meme, la direction de son agence, le cabinet.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { cloturerDelegation, creerDelegation } from "@/lib/services/delegations/delegations";
import { type Res, echecDepuis } from "@/lib/actions/resultat";

const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zDelegation = z
  .object({
    deUserId: z.string().min(1),
    aUserIds: z.array(z.string().min(1)).min(1, "Choisir au moins un bénéficiaire.").max(10),
    portee: z.enum(["portefeuille", "agence", "copro"]),
    agenceCode: z.string().trim().toUpperCase().max(5).optional(),
    coproCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,20}$/).optional(),
    depuisISO: zJour,
    jusquaISO: zJour.optional(),
    motif: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.portee !== "agence" || d.agenceCode, { message: "Choisir l'agence." })
  .refine((d) => d.portee !== "copro" || d.coproCode, { message: "Indiquer le code de la copropriété." })
  .refine((d) => !d.jusquaISO || d.jusquaISO >= d.depuisISO, { message: "La fin doit être après le début." });

export async function creerDelegationAction(input: unknown): Promise<Res<{ nombre: number }>> {
  const p = zDelegation.safeParse(input);
  if (!p.success) return { ok: false, erreur: p.error.issues[0]?.message ?? "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    const nombre = await creerDelegation({ id: g.id, nomComplet: g.nomComplet, superAdmin: estSuperAdmin(g.email) }, p.data);
    revalidatePath("/delegations");
    return { ok: true, donnees: { nombre } };
  } catch (e) {
    return echecDepuis(e, "delegations");
  }
}

export async function cloturerDelegationAction(id: unknown): Promise<Res> {
  if (typeof id !== "string" || !id) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    await cloturerDelegation({ id: g.id, nomComplet: g.nomComplet, superAdmin: estSuperAdmin(g.email) }, id);
    revalidatePath("/delegations");
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "delegations");
  }
}
