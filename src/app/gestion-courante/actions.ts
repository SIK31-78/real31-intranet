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
  type SelectionGc,
} from "@/lib/services/facturation/gestion-courante";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

const zPeriode = z.string().trim().refine(periodeValide, "Periode attendue au format AAAA-Tn");

/** Selection de l'ecran. Les codes copro sont des references logiques courtes. */
const zCode = z.string().trim().min(1).max(32);
const zSelection = z.object({
  coproCodes: z.array(zCode).max(1000),
  confirmeesParEcrit: z.array(zCode).max(1000).optional(),
});

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

/**
 * Lance la facturation du trimestre (création + émission Pennylane) pour les
 * copropriétés EXPLICITEMENT sélectionnées à l'écran.
 *
 * La sélection est une intention, pas une autorisation : le service rejoue le
 * filet de sécurité contre l'état de la base avant d'écrire (doublon, contrat
 * absent, surfacturation > +20 % non confirmée par écrit).
 */
export async function lancerGestionCouranteAction(
  periode: string,
  selection: SelectionGc,
): Promise<Res<ResultatLancementGc>> {
  if (!zPeriode.safeParse(periode).success) return { ok: false, erreur: "Période invalide." };
  const sel = zSelection.safeParse(selection);
  if (!sel.success) return { ok: false, erreur: "Sélection invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutVoirComptabilite(g.email, g.role))
    return { ok: false, erreur: "Réservé au pôle comptable." };
  try {
    const donnees = await lancerGestionCourante(periode, g.initiales, sel.data);
    revalidatePath("/gestion-courante", "layout");
    revalidatePath("/facturation", "layout");
    return { ok: true, donnees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
