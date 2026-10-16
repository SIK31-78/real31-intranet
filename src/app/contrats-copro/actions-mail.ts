"use server";

// Server Actions du mail au conseil syndical (module « Contrats & contrôles », REA-333,
// décision 9). Deux temps : préparer l'aperçu, puis envoyer le texte relu. Le périmètre
// d'écriture (ADR-041) et le gating mail sont vérifiés dans le service ; la boîte d'envoi est
// celle de la session (jamais un paramètre client).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { SUJETS } from "@/lib/domain/contrats-copro";
import { adresseMailValide } from "@/lib/domain/mes-emails-composition";
import { envoyerMailCs, preparerMailCs, type ApercuMailCs } from "@/lib/services/contrats-copro/mail-cs";
import type { AuteurContrats } from "@/lib/services/contrats-copro/types";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const zCode = z.string().trim().min(2).max(20);
const zVariante = z.enum(["comparatif", "devis_unique"]);
const zAdresse = z.string().trim().max(320).refine(adresseMailValide, { message: "Adresse e-mail invalide." });

const zPreparer = z
  .object({
    coproCode: zCode,
    sujet: z.enum(SUJETS),
    variante: zVariante,
    modeleId: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const zEnvoyer = z
  .object({
    coproCode: zCode,
    sujet: z.enum(SUJETS),
    variante: zVariante,
    modeleId: z.string().trim().min(1).max(80).optional(),
    objet: z.string().trim().min(1).max(300),
    corpsTexte: z.string().min(1).max(20_000),
    a: z.array(zAdresse).min(1).max(100),
    cc: z.array(zAdresse).max(50),
    tableauInclus: z.boolean(),
  })
  .strict();

function auteurDe(g: Gestionnaire): AuteurContrats {
  return { id: g.id, nom: g.nomComplet, ...(g.email ? { email: g.email } : {}) };
}

export async function preparerMailCsAction(input: unknown): Promise<Res<ApercuMailCs>> {
  return actionGestionnaire(zPreparer, input, "contrats-copro/mail-cs", (p, g) => preparerMailCs(p, auteurDe(g)));
}

export async function envoyerMailCsAction(input: unknown): Promise<Res<{ a: string[]; cc: string[] }>> {
  return actionGestionnaire(zEnvoyer, input, "contrats-copro/mail-cs", async (p, g) => {
    const envoi = await envoyerMailCs(p, auteurDe(g));
    revalidatePath(`/copropriete/${encodeURIComponent(p.coproCode)}`);
    return envoi;
  });
}
