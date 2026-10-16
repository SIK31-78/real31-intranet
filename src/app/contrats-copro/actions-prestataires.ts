"use server";

// Server Actions des prestataires d'une copropriété (module « Contrats & contrôles »,
// REA-333, décision 4) : lier ou délier une entreprise du référentiel du cabinet. Patron
// actionGestionnaire : zod -> session -> service -> Res. Le périmètre d'écriture (ADR-041)
// est vérifié dans le service.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { METIERS_PRESTATAIRE } from "@/lib/domain/contrats-copro/types";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { delierPrestataire, lierPrestataire } from "@/lib/services/contrats-copro/prestataires";
import type { AuteurContrats } from "@/lib/services/contrats-copro/types";

const zCode = z.string().trim().min(2).max(20);
const zId = z.string().min(1).max(80);
const zMetier = z.enum(METIERS_PRESTATAIRE);

function auteurDepuis(g: Gestionnaire): AuteurContrats {
  return { id: g.id, nom: g.nomComplet, ...(g.email ? { email: g.email } : {}) };
}

function revalider(coproCode: string) {
  revalidatePath(`/copropriete/${coproCode}`);
}

const zLier = z.object({ coproCode: zCode, entrepriseId: zId, metier: zMetier, principal: z.boolean() }).strict();

export async function lierPrestataireAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zLier, input, "contrats-prestataire-lier", async (d, g) => {
    await lierPrestataire(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

const zDelier = z.object({ coproCode: zCode, entrepriseId: zId, metier: zMetier }).strict();

export async function delierPrestataireAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zDelier, input, "contrats-prestataire-delier", async (d, g) => {
    await delierPrestataire(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}
