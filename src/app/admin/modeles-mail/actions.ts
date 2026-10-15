"use server";

// Server Actions de /admin/modeles-mail (REA-296). Garde serveur à chaque action : admins et
// responsables d'agence (peutEditerModelesMail), sur l'agence du modèle AVANT et APRÈS la
// modification. Le masquage dans l'écran ne protège rien.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { MESSAGE_RESERVE_DIRECTION, peutEditerModelesMail, profilDe } from "@/lib/auth/roles";
import { getAgenceRepository, getModeleMailRepository } from "@/lib/adapters/router";
import { ModelesMailNonConfigureError, variablesInconnues } from "@/lib/domain/modeles-mail";
import type { SaisieModeleMail } from "@/lib/ports/modele-mail-repository";

type Res = { ok: boolean; message?: string };

const zSaisie = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire.").max(120),
  sujet: z.string().trim().max(200),
  corps: z.string().trim().min(1, "Le texte est obligatoire.").max(20_000),
  // "" = tout le cabinet ; sinon un code d'agence, revérifié contre la table Agency.
  agence: z.string().trim().max(10),
  actif: z.boolean(),
});
const zId = z.string().trim().min(1).max(80);

function revalider() {
  revalidatePath("/admin/modeles-mail");
  revalidatePath("/mes-emails");
  revalidatePath("/mes-emails/composer");
}

/** La saisie validée, ou le message à montrer. L'agence est relue contre la table Agency. */
async function lireSaisie(input: unknown): Promise<{ ok: true; s: Omit<SaisieModeleMail, "auteurEmail"> } | { ok: false; message: string }> {
  const p = zSaisie.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Saisie invalide." };
  const inconnues = variablesInconnues(`${p.data.sujet}\n${p.data.corps}`);
  if (inconnues.length) {
    return { ok: false, message: `Variable inconnue : ${inconnues.map((v) => `{{${v}}}`).join(", ")}. Utilise celles de l'aide.` };
  }
  let agence: string | null = null;
  if (p.data.agence) {
    const connues = new Set((await getAgenceRepository().listerAgences()).map((a) => a.code.toUpperCase()));
    agence = p.data.agence.toUpperCase();
    if (!connues.has(agence)) return { ok: false, message: "Agence inconnue." };
  }
  return { ok: true, s: { titre: p.data.titre, sujet: p.data.sujet, corps: p.data.corps, agence, actif: p.data.actif } };
}

async function auteur() {
  const g = await getGestionnaireCourant();
  return g ? { g, profil: profilDe(g) } : null;
}

function enErreur(e: unknown): Res {
  if (e instanceof ModelesMailNonConfigureError) return { ok: false, message: e.message };
  throw e;
}

export async function creerModeleMailAction(input: unknown): Promise<Res> {
  const a = await auteur();
  if (!a) return { ok: false, message: "Non connecté." };
  const lu = await lireSaisie(input);
  if (!lu.ok) return lu;
  if (!peutEditerModelesMail(a.profil, lu.s.agence ?? undefined)) return { ok: false, message: MESSAGE_RESERVE_DIRECTION };
  try {
    await getModeleMailRepository().creer({ ...lu.s, ...(a.g.email ? { auteurEmail: a.g.email } : {}) });
  } catch (e) {
    return enErreur(e);
  }
  revalider();
  return { ok: true };
}

export async function modifierModeleMailAction(id: unknown, input: unknown): Promise<Res> {
  const a = await auteur();
  if (!a) return { ok: false, message: "Non connecté." };
  const pid = zId.safeParse(id);
  if (!pid.success) return { ok: false, message: "Modèle introuvable." };
  const lu = await lireSaisie(input);
  if (!lu.ok) return lu;
  try {
    const repo = getModeleMailRepository();
    const avant = await repo.trouver(pid.data);
    if (!avant) return { ok: false, message: "Modèle introuvable." };
    // Les deux agences : on ne déplace pas un modèle d'une agence qu'on ne gère pas, ni vers elle.
    if (!peutEditerModelesMail(a.profil, avant.agence ?? undefined) || !peutEditerModelesMail(a.profil, lu.s.agence ?? undefined)) {
      return { ok: false, message: MESSAGE_RESERVE_DIRECTION };
    }
    await repo.modifier(pid.data, { ...lu.s, ...(a.g.email ? { auteurEmail: a.g.email } : {}) });
  } catch (e) {
    return enErreur(e);
  }
  revalider();
  return { ok: true };
}

export async function supprimerModeleMailAction(id: unknown): Promise<Res> {
  const a = await auteur();
  if (!a) return { ok: false, message: "Non connecté." };
  const pid = zId.safeParse(id);
  if (!pid.success) return { ok: false, message: "Modèle introuvable." };
  try {
    const repo = getModeleMailRepository();
    const avant = await repo.trouver(pid.data);
    if (!avant) return { ok: false, message: "Modèle introuvable." };
    if (!peutEditerModelesMail(a.profil, avant.agence ?? undefined)) return { ok: false, message: MESSAGE_RESERVE_DIRECTION };
    await repo.supprimer(pid.data);
  } catch (e) {
    return enErreur(e);
  }
  revalider();
  return { ok: true };
}
