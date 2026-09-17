"use server";

// Server Actions du module Perte de copropriete. Premier module sur actionGestionnaire
// (zod -> session -> corps -> Res) : les gardes metier restent dans le corps.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { estDirection, MESSAGE_RESERVE_DIRECTION, peutOuvrirPerte, profilDe } from "@/lib/auth/roles";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { actionGestionnaire, Refus } from "@/lib/actions/garde";
import { agenceDeCopro } from "@/lib/services/agences/resoudre-agence";
import { getDossierPerte, mettreAJourEtapePerte, ouvrirDossierPerte } from "@/lib/services/perte/dossier-perte";
import { normaliserStatut, STATUTS_ETAPE } from "@/lib/domain/suivi/etape";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const zMaj = z.object({
  dossierId: z.string().min(1),
  code: z.string().regex(/^[A-Z]{2}\d$/),
  // « sans_objet » = l'ancien nom d'« ignore » (un onglet ouvert avant la mise en ligne l'envoie encore).
  statut: z.enum([...STATUTS_ETAPE, "sans_objet"]).transform(normaliserStatut).optional(),
  assigneA: z.string().max(80).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  controle: z.object({ libelle: z.string().min(1), coche: z.boolean() }).optional(),
});

export async function mettreAJourEtapeAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zMaj, input, "perte-copro", async ({ dossierId, code, ...patch }, g) => {
    // Cocher, assigner, noter : la direction de l'agence, ou quelqu'un du portefeuille de
    // la copro (audit du 16/09/2026 : tout le cabinet pouvait modifier n'importe quel dossier).
    const dossier = await getDossierPerte(dossierId);
    if (!dossier) throw new Refus("Dossier de perte introuvable.");
    if (!estDirection(profilDe(g), await agenceDeCopro(dossier.coproCode))) await exigerPerimetre(dossier.coproCode, g.id);
    await mettreAJourEtapePerte(dossierId, code, patch, g.nomComplet);
    revalidatePath(`/perte-copro/${dossierId}`);
    revalidatePath("/perte-copro");
  });
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
  return actionGestionnaire(zOuverture, input, "perte-copro", async (d, g) => {
    if (!peutOuvrirPerte(profilDe(g), await agenceDeCopro(d.coproCode))) throw new Refus(MESSAGE_RESERVE_DIRECTION);
    if (d.confirmation.trim().toUpperCase() !== d.coproCode.toUpperCase()) {
      throw new Refus("Retape le code de la copropriété pour confirmer.");
    }
    const dossier = await ouvrirDossierPerte({
      coproCode: d.coproCode,
      dateAgISO: d.dateAgISO,
      finGestionISO: d.finGestionISO,
      ...(d.motif ? { motif: d.motif } : {}),
      par: g.nomComplet,
    });
    revalidatePath("/perte-copro");
    revalidatePath("/gestion-courante");
    revalidatePath("/copropriete");
    revalidatePath("/contrat");
    revalidatePath("/accueil");
    return { dossierId: dossier.id };
  });
}
