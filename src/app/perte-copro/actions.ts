"use server";

// Server Actions du module Perte de copropriete. Ouvertes a tout gestionnaire connecte :
// c'est un tableau de suivi d'equipe (la gestion des roles viendra plus tard, roadmap).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estDirection, MESSAGE_RESERVE_DIRECTION, peutOuvrirPerte, profilDe } from "@/lib/auth/roles";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { agenceDeCopro } from "@/lib/services/agences/resoudre-agence";
import { getDossierPerte, mettreAJourEtapePerte, ouvrirDossierPerte } from "@/lib/services/perte/dossier-perte";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const zMaj = z.object({
  dossierId: z.string().min(1),
  code: z.string().regex(/^[A-Z]{2}\d$/),
  statut: z.enum(["a_faire", "en_cours", "bloque", "fait", "sans_objet"]).optional(),
  assigneA: z.string().max(80).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  controle: z.object({ libelle: z.string().min(1), coche: z.boolean() }).optional(),
});

export async function mettreAJourEtapeAction(input: unknown): Promise<Res> {
  const p = zMaj.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    const { dossierId, code, ...patch } = p.data;
    // Cocher, assigner, noter : la direction de l'agence, ou quelqu'un du portefeuille de
    // la copro (audit du 16/09/2026 : tout le cabinet pouvait modifier n'importe quel dossier).
    const dossier = await getDossierPerte(dossierId);
    if (!dossier) return { ok: false, erreur: "Dossier de perte introuvable." };
    if (!estDirection(profilDe(g), await agenceDeCopro(dossier.coproCode))) await exigerPerimetre(dossier.coproCode, g.id);
    await mettreAJourEtapePerte(dossierId, code, patch, g.nomComplet);
    revalidatePath(`/perte-copro/${dossierId}`);
    revalidatePath("/perte-copro");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

const zOuverture = z.object({
  coproCode: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
  dateAgISO: zJour,
  finGestionISO: zJour,
  motif: z.string().max(300).optional(),
  confirmation: z.string(),
});

/** Ouvrir un dossier depuis le module lui-meme (meme geste que dans la gestion courante). */
export async function ouvrirDossierAction(input: unknown): Promise<Res<{ dossierId: string }>> {
  const p = zOuverture.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutOuvrirPerte(profilDe(g), await agenceDeCopro(p.data.coproCode))) return { ok: false, erreur: MESSAGE_RESERVE_DIRECTION };
  if (p.data.confirmation.trim().toUpperCase() !== p.data.coproCode.toUpperCase()) {
    return { ok: false, erreur: "Retape le code de la copropriété pour confirmer." };
  }
  try {
    const dossier = await ouvrirDossierPerte({
      coproCode: p.data.coproCode,
      dateAgISO: p.data.dateAgISO,
      finGestionISO: p.data.finGestionISO,
      ...(p.data.motif ? { motif: p.data.motif } : {}),
      par: g.nomComplet,
    });
    revalidatePath("/perte-copro");
    revalidatePath("/gestion-courante");
    revalidatePath("/copropriete");
    revalidatePath("/contrat");
    revalidatePath("/accueil");
    return { ok: true, donnees: { dossierId: dossier.id } };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
