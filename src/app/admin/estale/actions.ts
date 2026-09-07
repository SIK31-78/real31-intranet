"use server";

// Server Actions du panneau /admin/estale (points a porter a ESTALE).
// Garde : SUPER-ADMIN seulement - c'est l'outil de pilotage fournisseur de Sekou.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { getPointsEstaleRepository } from "@/lib/adapters/router";
import { PointsEstaleNonConfigureError } from "@/lib/ports/points-estale-repository";
import {
  CATEGORIES_POINT_ESTALE,
  STATUTS_POINT_ESTALE,
  type CategoriePointEstale,
  type StatutPointEstale,
} from "@/lib/domain/points-estale";

type Resultat = { ok: boolean; message?: string };

async function garde(): Promise<Resultat | null> {
  const g = await getGestionnaireCourant();
  if (!g || !estSuperAdmin(g.email)) return { ok: false, message: "Réservé au super-admin." };
  return null;
}

function messageErreur(e: unknown): string {
  if (e instanceof PointsEstaleNonConfigureError) return e.message;
  return e instanceof Error ? e.message : "Action impossible.";
}

const zCreation = z.object({
  titre: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(8000).optional(),
  bloquant: z.boolean().default(false),
  categorie: z
    .enum(CATEGORIES_POINT_ESTALE as unknown as [CategoriePointEstale, ...CategoriePointEstale[]])
    .default("produit"),
  demandeur: z.string().trim().max(20).optional(),
});

export async function creerPointAction(input: unknown): Promise<Resultat> {
  const refus = await garde();
  if (refus) return refus;
  const parse = zCreation.safeParse(input);
  if (!parse.success) return { ok: false, message: "Titre requis." };
  try {
    const { titre, detail, bloquant, categorie, demandeur } = parse.data;
    await getPointsEstaleRepository().creer({
      titre,
      ...(detail ? { detail } : {}),
      bloquant,
      categorie,
      ...(demandeur ? { demandeur } : {}),
    });
    revalidatePath("/admin/estale");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageErreur(e) };
  }
}

const zPatch = z.object({
  id: z.string().trim().min(1).max(80),
  titre: z.string().trim().min(1).max(200).optional(),
  detail: z.string().trim().max(8000).nullable().optional(),
  bloquant: z.boolean().optional(),
  categorie: z
    .enum(CATEGORIES_POINT_ESTALE as unknown as [CategoriePointEstale, ...CategoriePointEstale[]])
    .optional(),
  demandeur: z.string().trim().max(20).nullable().optional(),
  statut: z.enum(STATUTS_POINT_ESTALE as unknown as [StatutPointEstale, ...StatutPointEstale[]]).optional(),
  reponse: z.string().trim().max(8000).nullable().optional(),
});

export async function editerPointAction(input: unknown): Promise<Resultat> {
  const refus = await garde();
  if (refus) return refus;
  const parse = zPatch.safeParse(input);
  if (!parse.success) return { ok: false, message: "Saisie invalide." };
  try {
    const { id, ...patch } = parse.data;
    const r = await getPointsEstaleRepository().patch(id, patch);
    if (!r) return { ok: false, message: "Point introuvable." };
    revalidatePath("/admin/estale");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageErreur(e) };
  }
}
