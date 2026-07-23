"use server";

// Server Actions du panneau /admin/annonces. RESERVEES SUPER-ADMIN (garde serveur a
// chaque action : le masquage UI ne protege rien). Validation zod. Les annonces actives
// s'affichent sur l'accueil (revalidation des deux chemins a chaque ecriture).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { getAnnonceRepository } from "@/lib/adapters/router";
import {
  AnnoncesNonConfigureError,
  NIVEAUX_ANNONCE,
  type NiveauAnnonce,
} from "@/lib/domain/annonce";

async function exigerSuperAdmin(): Promise<
  { ok: true; email?: string; initiales: string } | { ok: false; message: string }
> {
  const g = await getGestionnaireCourant();
  if (!g || !estSuperAdmin(g.email)) return { ok: false, message: "Action réservée au super-admin." };
  return { ok: true, ...(g.email ? { email: g.email } : {}), initiales: g.initiales };
}

function revalider() {
  revalidatePath("/admin/annonces");
  revalidatePath("/accueil");
}

const zNiveau = z.enum(NIVEAUX_ANNONCE as unknown as [NiveauAnnonce, ...NiveauAnnonce[]]);

const zCreation = z.object({
  titre: z.string().trim().min(1).max(160),
  corps: z.string().trim().max(2000).optional(),
  niveau: zNiveau,
  actif: z.boolean(),
});

export async function creerAnnonceAction(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = zCreation.safeParse(input);
  if (!parse.success) return { ok: false, message: parse.error.issues[0]?.message ?? "Saisie invalide." };
  const { titre, corps, niveau, actif } = parse.data;

  try {
    await getAnnonceRepository().creer({
      titre,
      niveau,
      actif,
      ...(corps ? { corps } : {}),
      ...(garde.email ? { auteurEmail: garde.email } : {}),
      auteurInitiales: garde.initiales,
    });
  } catch (e) {
    if (e instanceof AnnoncesNonConfigureError) {
      return { ok: false, message: "La table annonces n'existe pas encore (SQL à passer)." };
    }
    throw e;
  }
  revalider();
  return { ok: true };
}

const zEdition = z
  .object({
    id: z.string().trim().min(1).max(120),
    titre: z.string().trim().min(1).max(160).optional(),
    // "" ou null efface le corps ; absent = ne pas toucher.
    corps: z.string().trim().max(2000).nullable().optional(),
    niveau: zNiveau.optional(),
    actif: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.titre !== undefined || v.corps !== undefined || v.niveau !== undefined || v.actif !== undefined,
    { message: "Rien à modifier." },
  );

export async function patchAnnonceAction(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = zEdition.safeParse(input);
  if (!parse.success) return { ok: false, message: parse.error.issues[0]?.message ?? "Saisie invalide." };
  const { id, titre, corps, niveau, actif } = parse.data;

  const maj = await getAnnonceRepository().patch(id, {
    ...(titre !== undefined ? { titre } : {}),
    ...(corps !== undefined ? { corps } : {}),
    ...(niveau !== undefined ? { niveau } : {}),
    ...(actif !== undefined ? { actif } : {}),
  });
  if (!maj) return { ok: false, message: "Annonce introuvable." };
  revalider();
  return { ok: true };
}

const zSuppression = z.object({ id: z.string().trim().min(1).max(120) });

export async function supprimerAnnonceAction(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const garde = await exigerSuperAdmin();
  if (!garde.ok) return { ok: false, message: garde.message };

  const parse = zSuppression.safeParse(input);
  if (!parse.success) return { ok: false, message: "Saisie invalide." };

  const ok = await getAnnonceRepository().supprimer(parse.data.id);
  if (!ok) return { ok: false, message: "Annonce introuvable." };
  revalider();
  return { ok: true };
}
