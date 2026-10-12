"use server";

// Annonce de la prochaine AG aux copropriétaires par un mailing ESTALE (REA-144).
// Deux actions : l'aperçu (lecture) et la création du BROUILLON dans ESTALE. Aucune
// n'envoie : l'envoi se lance dans ESTALE, par le gestionnaire, après relecture.

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { ancreDuJour } from "@/lib/services/date-du-jour";
import {
  apercuAnnonceAg,
  creerAnnonceAg,
  type ApercuAnnonceAg,
  type AuteurAnnonce,
  type Resultat,
} from "@/lib/services/estale/annonce-ag-mailing";
import type { MailingCree } from "@/lib/ports/mailing-estale-provider";
import { coproCodeDeAgId } from "@/lib/domain/supervision-ag";
import type { ModeleAnnonceAg } from "@/lib/domain/annonce-ag-mailing";

const zAgId = z.string().trim().min(1).max(120);
const zModele = z.enum(["presentiel", "hybride"]).optional();

async function auteur(agId: string): Promise<AuteurAnnonce | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCodeDeAgId(agId), g.id))) return null;
  return { id: g.id, nomComplet: g.nomComplet, ...(g.email ? { email: g.email } : {}) };
}

export async function apercuAnnonceAgAction(
  agId: string,
  modele?: ModeleAnnonceAg,
): Promise<Resultat<ApercuAnnonceAg>> {
  if (!zAgId.safeParse(agId).success || !zModele.safeParse(modele).success) {
    return { ok: false, raison: "Demande invalide." };
  }
  const a = await auteur(agId);
  if (!a) return { ok: false, raison: "Copropriété hors de votre périmètre." };
  try {
    return await apercuAnnonceAg(coproCodeDeAgId(agId), a, ancreDuJour(), modele);
  } catch (e) {
    return { ok: false, raison: (e as Error).message };
  }
}

export async function creerAnnonceAgAction(
  agId: string,
  modele?: ModeleAnnonceAg,
): Promise<Resultat<MailingCree>> {
  if (!zAgId.safeParse(agId).success || !zModele.safeParse(modele).success) {
    return { ok: false, raison: "Demande invalide." };
  }
  const a = await auteur(agId);
  if (!a) return { ok: false, raison: "Copropriété hors de votre périmètre." };
  try {
    return await creerAnnonceAg(coproCodeDeAgId(agId), a, ancreDuJour(), modele);
  } catch (e) {
    return { ok: false, raison: (e as Error).message };
  }
}
