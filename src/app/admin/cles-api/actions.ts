"use server";

// Server Actions du panneau /admin/cles-api. RESERVEES SUPER-ADMIN (garde serveur a
// chaque action : le masquage UI ne protege rien). Le CLAIR de la cle ne transite
// qu'UNE fois, dans la reponse de creerCle - jamais persiste, jamais logue.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { creerCleApi, revoquerCleApi } from "@/lib/auth/cle-api";
import { SCOPES_API, estScopeEcriture, type ScopeApi } from "@/lib/domain/cle-api";
import type { CleApi } from "@/lib/domain/cle-api";

const zCreation = z
  .object({
    nom: z.string().trim().min(1).max(120),
    scopes: z
      .array(z.enum(SCOPES_API as unknown as [ScopeApi, ...ScopeApi[]]))
      .min(1)
      .max(SCOPES_API.length),
    managerId: z.string().trim().min(1).max(120).optional(),
    /** Date d'expiration "YYYY-MM-DD" (fin de journee UTC) ; absente = pas d'expiration. */
    expireLe: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  // Regle du domaine, refusee DES la creation (et de toute facon a la verification) :
  // une cle cabinet (sans gestionnaire) ne peut pas porter un scope d'ecriture.
  .refine((v) => v.managerId || !v.scopes.some((s) => estScopeEcriture(s)), {
    message: "Un scope d'écriture exige une clé liée à un gestionnaire.",
  });

export type ResultatCreation =
  | { ok: true; cleEnClair: string; enregistrement: CleApi }
  | { ok: false; message: string };

async function exigerSuperAdmin(): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const g = await getGestionnaireCourant();
  if (!g || !estSuperAdmin(g.email)) {
    return { ok: false, message: "Action réservée au super-admin." };
  }
  return { ok: true, email: g.email ?? g.initiales };
}

export async function creerCle(input: unknown): Promise<ResultatCreation> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = zCreation.safeParse(input);
  if (!parse.success) {
    const detail = parse.error.issues[0]?.message ?? "Saisie invalide.";
    return { ok: false, message: detail };
  }
  const { nom, scopes, managerId, expireLe } = parse.data;

  try {
    const { cleEnClair, enregistrement } = await creerCleApi({
      nom,
      scopes,
      ...(managerId ? { managerId } : {}),
      creePar: garde.email,
      ...(expireLe ? { expiresAt: `${expireLe}T23:59:59.000Z` } : {}),
    });
    revalidatePath("/admin/cles-api");
    return { ok: true, cleEnClair, enregistrement };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Création impossible." };
  }
}

export async function revoquerCle(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = z.object({ id: z.string().trim().min(1).max(120) }).safeParse(input);
  if (!parse.success) return { ok: false, message: "Identifiant invalide." };

  try {
    await revoquerCleApi(parse.data.id);
    revalidatePath("/admin/cles-api");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Révocation impossible." };
  }
}
