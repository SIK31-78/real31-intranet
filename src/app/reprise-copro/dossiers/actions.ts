"use server";

// Server Actions du suivi des dossiers de reprise. Contrat uniforme {ok,...} : jamais
// de throw cote client. Validation Zod (bornage des tailles). Cloisonnement : on exige
// un gestionnaire connecte (getGestionnaireCourant).
//
// NB : une reprise concerne une copro PAS ENCORE dans le perimetre eStale -> PAS de
// check coproAppartient ici (contrairement aux dossiers "classiques"). On se contente
// d'exiger un gestionnaire authentifie.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
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

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour creer un dossier." };

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
