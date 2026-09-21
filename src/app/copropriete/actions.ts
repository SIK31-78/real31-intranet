"use server";

import { revalidatePath } from "next/cache";
import { confirmerPriseEnMain } from "@/lib/services/coproprietes/prise-en-main";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { z } from "zod";
import { estEquipeSyndic, profilDe } from "@/lib/auth/roles";
import { getCoproRepository } from "@/lib/adapters/router";
import { FORMES_JURIDIQUES } from "@/lib/domain/copropriete";
import { type Res, echecDepuis } from "@/lib/actions/resultat";

// Onboarding : le gestionnaire confirme avoir verifie/corrige les dates d'une copro.
// Cloisonne : n'agit que sur une copro de son perimetre.
async function confirmer(coproCode: string): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return;
  await confirmerPriseEnMain(coproCode, g.initiales);
}

export async function prendreEnMainAction(coproCode: string): Promise<void> {
  await confirmer(coproCode);
  revalidatePath("/copropriete");
  revalidatePath("/accueil");
}

export async function prendreEnMainLotAction(coproCodes: string[]): Promise<void> {
  for (const code of coproCodes) await confirmer(code);
  revalidatePath("/copropriete");
  revalidatePath("/accueil");
}

const zForme = z.object({ coproCode: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/), forme: z.enum(FORMES_JURIDIQUES) });

/**
 * Forme juridique (copropriete / ASL / AFUL) : ecrite dans le referentiel partage (App A).
 * L'equipe syndic et la direction ; c'est elle qui choisit le contrat a editer.
 */
export async function changerFormeJuridiqueAction(input: unknown): Promise<Res> {
  const p = zForme.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!estEquipeSyndic(profilDe(g))) return { ok: false, erreur: "Réservé à l'équipe syndic." };
  try {
    await getCoproRepository().setFormeJuridique(p.data.coproCode, p.data.forme);
    revalidatePath(`/copropriete/${p.data.coproCode}`);
    revalidatePath(`/contrat/${p.data.coproCode}`);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "copropriete");
  }
}
