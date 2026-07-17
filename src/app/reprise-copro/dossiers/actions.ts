"use server";

// Server Actions du suivi des dossiers de reprise. Contrat uniforme {ok,...} : jamais
// de throw cote client. Validation Zod (bornage des tailles).
//
// NB : une reprise concerne une copro PAS ENCORE dans le perimetre eStale -> PAS de
// check coproAppartient ici (contrairement aux dossiers "classiques").
//
// ROLE : la LISTE des dossiers est ouverte a tous (lecture, cf. page.tsx) ; OUVRIR une reprise
// est un geste d'encadrement -> exigerAdminReprise (directeur / manager / super-admin).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdminReprise } from "@/lib/auth/garde-reprise";
import { getRepriseDossierRepository } from "@/lib/reprise/adapters/router";
import { creerDossierSuivi } from "@/lib/reprise/services/suivi-dossier";

const schemaCreation = z.object({
  ref: z.string().trim().min(1).max(40),
  nomUsuel: z.string().trim().min(1).max(200),
  adresse: z.string().trim().max(200).optional(),
});

export type CreerDossierResultat = { ok: true } | { ok: false; message: string };

export async function creerDossierAction(form: {
  ref: string;
  nomUsuel: string;
  adresse?: string;
}): Promise<CreerDossierResultat> {
  const valid = schemaCreation.safeParse(form);
  if (!valid.success) {
    return { ok: false, message: "Reference et nom de la copropriete requis (200 caracteres max)." };
  }

  const garde = await exigerAdminReprise("creer un dossier");
  if (!garde.ok) return { ok: false, message: garde.message };

  const repo = getRepriseDossierRepository();
  try {
    const adresse = valid.data.adresse?.trim() || undefined;
    await creerDossierSuivi(repo, valid.data.ref, valid.data.nomUsuel, adresse);
  } catch (e) {
    // Ex. dossier deja existant (meme ref). On remonte un message propre, pas un throw.
    return { ok: false, message: e instanceof Error ? e.message : "Creation impossible." };
  }

  revalidatePath("/reprise-copro/dossiers");
  return { ok: true };
}
