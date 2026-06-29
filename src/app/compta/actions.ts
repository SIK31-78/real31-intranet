"use server";

// Server Actions du pole compta : ajouter une note (comptable ou gestionnaire),
// marquer une note traitee, poser/retirer les flags. Passe par le service (ADR-001).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import {
  ajouterNoteCompta,
  getCoproCompta,
  marquerNoteCompta,
  setFlagCompta,
} from "@/lib/services/compta/get-compta";
import type { AuteurNote } from "@/lib/domain/compta";
import type { FlagCompta } from "@/lib/ports/compta-repository";

type Res = { ok: true } | { ok: false; erreur: string };

// Validation des entrees (zod) : ces Server Actions sont des endpoints POST publics.
const zCode = z.string().trim().min(1).max(40);
const zDate = z.string().trim().min(1).max(40);
const zId = z.string().trim().min(1).max(120);
const zTexte = z.string().max(5_000);
const zAuteur = z.enum(["comptable", "gestionnaire"]);
const zFlag = z.enum(["verifies", "envoyer-avant"]);

function revalider() {
  revalidatePath("/compta", "layout");
  revalidatePath("/copropriete", "layout");
}

export async function ajouterNoteAction(
  coproCode: string,
  agDateISO: string,
  auteur: AuteurNote,
  texte: string,
): Promise<Res> {
  if (!z.object({ coproCode: zCode, agDateISO: zDate, auteur: zAuteur, texte: zTexte }).safeParse({ coproCode, agDateISO, auteur, texte }).success)
    return { ok: false, erreur: "Données invalides." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!texte.trim()) return { ok: false, erreur: "Note vide." };
  // Garde d'appartenance (anti-IDOR) : la copro doit relever du gestionnaire courant.
  if (!(await getCoproCompta(coproCode, g.id))) return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    await ajouterNoteCompta(coproCode, agDateISO, auteur, texte.trim(), g.initiales, g.id);
    revalider();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function marquerNoteAction(
  coproCode: string,
  agDateISO: string,
  noteId: string,
  resolu: boolean,
): Promise<Res> {
  if (!z.object({ coproCode: zCode, agDateISO: zDate, noteId: zId, resolu: z.boolean() }).safeParse({ coproCode, agDateISO, noteId, resolu }).success)
    return { ok: false, erreur: "Données invalides." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  // Garde d'appartenance : la copro doit relever du gestionnaire courant (cloisonnement),
  // sinon on refuse avant tout UPDATE (anti-IDOR). L'UPDATE est ensuite borne a copro/AG.
  const copro = await getCoproCompta(coproCode, g.id);
  if (!copro) return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    await marquerNoteCompta(coproCode, agDateISO, noteId, resolu, g.initiales, g.id);
    revalider();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function setFlagAction(
  coproCode: string,
  agDateISO: string,
  flag: FlagCompta,
  valeur: boolean,
): Promise<Res> {
  if (!z.object({ coproCode: zCode, agDateISO: zDate, flag: zFlag, valeur: z.boolean() }).safeParse({ coproCode, agDateISO, flag, valeur }).success)
    return { ok: false, erreur: "Données invalides." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  // Garde d'appartenance (anti-IDOR) : la copro doit relever du gestionnaire courant.
  if (!(await getCoproCompta(coproCode, g.id))) return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    await setFlagCompta(coproCode, agDateISO, flag, valeur, g.initiales, g.id);
    revalider();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
