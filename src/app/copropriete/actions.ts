"use server";

import { revalidatePath } from "next/cache";
import { confirmerPriseEnMain } from "@/lib/services/coproprietes/prise-en-main";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { z } from "zod";
import { estDirectionQuelquePart, estEquipeSyndic, profilDe } from "@/lib/auth/roles";
import { getCoproRepository } from "@/lib/adapters/router";
import { FORMES_JURIDIQUES } from "@/lib/domain/copropriete";
import { type Res, echecDepuis } from "@/lib/actions/resultat";

// Onboarding : le gestionnaire confirme avoir verifie/corrige les dates d'une copro.
// Cloisonne : n'agit que sur une copro de son perimetre ; la direction et les super-admins
// (qui voient « Toutes les coproprietes ») peuvent prendre en main n'importe laquelle.
// Avant le 21/09/2026, un refus etait SILENCIEUX : l'action rendait sans rien faire et
// l'ecran disait « prise en main » (Sekou : « je clique dessus, rien ne se passe »).
async function confirmer(coproCode: string, g: NonNullable<Awaited<ReturnType<typeof getGestionnaireCourant>>>): Promise<string | null> {
  const partout = estDirectionQuelquePart(profilDe(g));
  if (process.env.COPRO_SOURCE === "supabase" && !partout && !(await coproAppartient(coproCode, g.id))) {
    return `${coproCode} n'est pas dans votre portefeuille.`;
  }
  await confirmerPriseEnMain(coproCode, g.initiales);
  return null;
}

export async function prendreEnMainAction(coproCode: string): Promise<Res> {
  return prendreEnMainLotAction([coproCode]);
}

export async function prendreEnMainLotAction(coproCodes: string[]): Promise<Res> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  const refus: string[] = [];
  try {
    for (const code of coproCodes) {
      const r = await confirmer(code, g);
      if (r) refus.push(r);
    }
  } catch (e) {
    return echecDepuis(e, "copropriete");
  }
  revalidatePath("/copropriete");
  revalidatePath("/accueil");
  if (refus.length === coproCodes.length) return { ok: false, erreur: refus[0]! };
  return { ok: true };
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
