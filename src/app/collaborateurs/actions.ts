"use server";

// Server Actions du module Collaborateurs. RESERVEES A LA DIRECTION (garde dans chaque
// action) : ce qu'on ecrit ici va dans public."User" et public."Copropriete" (App A).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estDirection, MESSAGE_RESERVE_DIRECTION, profilDe } from "@/lib/auth/roles";
import { HABILITATIONS, ROLES_TABLE } from "@/lib/domain/collaborateur";
import {
  ajouterHabilitation,
  annulerDepartCollaborateur,
  arriveeCollaborateur,
  cloreHabilitation,
  departCollaborateur,
  reaffecterCopro,
} from "@/lib/services/collaborateurs/collaborateurs";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

async function garde(): Promise<{ nom: string } | string> {
  const g = await getGestionnaireCourant();
  if (!g) return "Session expirée.";
  if (!estDirection(profilDe(g))) return MESSAGE_RESERVE_DIRECTION;
  return { nom: g.nomComplet };
}

const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zId = z.string().trim().min(1).max(80);

export async function arriveeAction(input: unknown): Promise<Res<{ id: string }>> {
  const p = z
    .object({
      nomComplet: z.string().trim().min(3).max(80),
      email: z.string().trim().min(5).max(120),
      roleTable: z.enum(ROLES_TABLE),
      agenceId: zId.optional(),
      referentDirectorId: zId.optional(),
      arriveeISO: zJour.optional(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await garde();
  if (typeof g === "string") return { ok: false, erreur: g };
  try {
    const id = await arriveeCollaborateur(p.data, g.nom);
    revalidatePath("/collaborateurs");
    return { ok: true, donnees: { id } };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function departAction(input: unknown): Promise<Res<{ reaffectees: number }>> {
  const p = z
    .object({
      userId: zId,
      departISO: zJour,
      remplacants: z.object({ gestionnaire: zId.optional(), assistant: zId.optional(), comptable: zId.optional() }),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await garde();
  if (typeof g === "string") return { ok: false, erreur: g };
  try {
    const r = await departCollaborateur(p.data.userId, p.data.departISO, p.data.remplacants, p.data.note, g.nom);
    revalidatePath("/collaborateurs");
    revalidatePath(`/collaborateurs/${p.data.userId}`);
    return { ok: true, donnees: r };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function annulerDepartAction(userId: unknown): Promise<Res> {
  const p = zId.safeParse(userId);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await garde();
  if (typeof g === "string") return { ok: false, erreur: g };
  try {
    await annulerDepartCollaborateur(p.data, g.nom);
    revalidatePath("/collaborateurs");
    revalidatePath(`/collaborateurs/${p.data}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function reaffecterAction(input: unknown): Promise<Res> {
  const p = z.object({ coproCode: z.string().trim().min(2).max(10), role: z.enum(["gestionnaire", "assistant", "comptable"]), userId: zId.nullable(), depuis: zId }).safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await garde();
  if (typeof g === "string") return { ok: false, erreur: g };
  try {
    await reaffecterCopro(p.data.coproCode, p.data.role, p.data.userId);
    revalidatePath("/collaborateurs");
    revalidatePath(`/collaborateurs/${p.data.depuis}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function habilitationAction(input: unknown): Promise<Res> {
  const p = z.union([
    z.object({ action: z.literal("ajouter"), userId: zId, type: z.enum(HABILITATIONS), agence: z.string().trim().min(2).max(5).optional() }),
    z.object({ action: z.literal("clore"), userId: zId, id: zId }),
  ]).safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await garde();
  if (typeof g === "string") return { ok: false, erreur: g };
  try {
    if (p.data.action === "ajouter") await ajouterHabilitation(p.data.userId, p.data.type, p.data.agence, g.nom);
    else await cloreHabilitation(p.data.id);
    revalidatePath(`/collaborateurs/${p.data.userId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
