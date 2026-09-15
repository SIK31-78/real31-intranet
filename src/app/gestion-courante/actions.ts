"use server";

// Server Actions de la facturation de gestion courante trimestrielle.
// Action TRANSVERSE reservee au pole comptable : elle facture TOUTES les copros
// d'un coup. L'autorisation se fait ici (role comptable), pas par copro.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirGestionCourante } from "@/lib/auth/roles";
import { perdreCopro } from "@/lib/services/coproprietes/perdre-copro";
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
  if (!peutVoirGestionCourante(g.email))
    return { ok: false, erreur: "Réservé à la comptabilité du cabinet." };
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
  if (!peutVoirGestionCourante(g.email))
    return { ok: false, erreur: "Réservé à la comptabilité du cabinet." };
  try {
    const donnees = await lancerGestionCourante(periode, g.initiales, sel.data);
    revalidatePath("/gestion-courante", "layout");
    revalidatePath("/facturation", "layout");
    return { ok: true, donnees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Perdre une copropriete (Sekou, 15/09/2026) : la passer INACTIVE au referentiel, avec
// la trace. Meme habilitation que la facturation : c'est la comptabilite du cabinet qui
// sait qu'une copro est partie, et c'est elle que ca protege d'une fausse facture.

const zPerte = z.object({
  coproCode: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
  finGestionISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motif: z.string().max(300).optional(),
  /** Le code retape : une copro perdue disparait de tout l'intranet, on ne clique pas a cote. */
  confirmation: z.string(),
});

export async function perdreCoproAction(input: unknown): Promise<Res<{ coproCode: string }>> {
  const p = zPerte.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutVoirGestionCourante(g.email))
    return { ok: false, erreur: "Réservé à la comptabilité du cabinet." };
  if (p.data.confirmation.trim().toUpperCase() !== p.data.coproCode.toUpperCase()) {
    return { ok: false, erreur: "Retape le code de la copropriété pour confirmer." };
  }
  try {
    await perdreCopro({
      coproCode: p.data.coproCode,
      finGestionISO: p.data.finGestionISO,
      ...(p.data.motif ? { motif: p.data.motif } : {}),
      par: g.nomComplet,
    });
    revalidatePath("/gestion-courante");
    revalidatePath("/copropriete");
    revalidatePath("/contrat");
    revalidatePath("/accueil");
    return { ok: true, donnees: { coproCode: p.data.coproCode } };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
