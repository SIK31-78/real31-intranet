"use server";

// Server Actions de la facturation de gestion courante trimestrielle.
// Action TRANSVERSE reservee au pole comptable : elle facture TOUTES les copros
// d'un coup. L'autorisation se fait ici (role comptable), pas par copro.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirComptabilite } from "@/lib/auth/roles";
import {
  apercuGestionCourante,
  lancerGestionCourante,
  periodeValide,
  type ApercuGestionCourante,
  type ResultatLancementGc,
} from "@/lib/services/facturation/gestion-courante";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

const zPeriode = z.string().trim().refine(periodeValide, "Periode attendue au format AAAA-Tn");

/** Recap du trimestre, sans aucune ecriture. */
export async function apercuGestionCouranteAction(
  periode: string,
): Promise<Res<ApercuGestionCourante>> {
  if (!zPeriode.safeParse(periode).success) return { ok: false, erreur: "Période invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutVoirComptabilite(g.email, g.role))
    return { ok: false, erreur: "Réservé au pôle comptable." };
  try {
    return { ok: true, donnees: await apercuGestionCourante(periode) };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

/** Lance la facturation du trimestre (création + émission Pennylane). */
export async function lancerGestionCouranteAction(
  periode: string,
): Promise<Res<ResultatLancementGc>> {
  if (!zPeriode.safeParse(periode).success) return { ok: false, erreur: "Période invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutVoirComptabilite(g.email, g.role))
    return { ok: false, erreur: "Réservé au pôle comptable." };
  try {
    const donnees = await lancerGestionCourante(periode, g.initiales);
    revalidatePath("/gestion-courante", "layout");
    revalidatePath("/facturation", "layout");
    return { ok: true, donnees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
