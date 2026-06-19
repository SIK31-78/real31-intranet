"use server";

// Server Actions du pole compta : ajouter une note (comptable ou gestionnaire),
// marquer une note traitee, poser/retirer les flags. Passe par le service (ADR-001).

import { revalidatePath } from "next/cache";
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
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!texte.trim()) return { ok: false, erreur: "Note vide." };
  try {
    await ajouterNoteCompta(coproCode, agDateISO, auteur, texte.trim(), g.initiales);
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
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  // Garde d'appartenance : la copro doit relever du gestionnaire courant (cloisonnement),
  // sinon on refuse avant tout UPDATE (anti-IDOR). L'UPDATE est ensuite borne a copro/AG.
  const copro = await getCoproCompta(coproCode, g.id);
  if (!copro) return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    await marquerNoteCompta(coproCode, agDateISO, noteId, resolu, g.initiales);
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
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    await setFlagCompta(coproCode, agDateISO, flag, valeur, g.initiales);
    revalider();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
