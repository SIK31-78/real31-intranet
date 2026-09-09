"use server";

// Server Actions du tableau d'équipe des reprises. Contrat uniforme {ok,...} : jamais
// de throw côté client. Validation Zod (bornage des tailles).
//
// NB : une reprise concerne une copro PAS ENCORE dans le périmètre eStale -> PAS de
// check coproAppartient ici (contrairement aux dossiers « classiques »).
//
// RÔLE : la LISTE est ouverte à tous (lecture, cf. page.tsx) ; OUVRIR une reprise est un geste
// d'encadrement -> exigerAdminReprise (directeur / manager / super-admin).
// ANTI-INJECTION : les ids de l'équipe passent par validerCollaborateursConnus.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdminReprise } from "@/lib/auth/garde-reprise";
import { getRepriseDossierRepository } from "@/lib/reprise/adapters/router";
import { creerDossierSuivi } from "@/lib/reprise/services/suivi-dossier";
import { ROLES_REPRISE, type EquipeReprise, type RoleReprise } from "@/lib/reprise/domain/dossier";
import { validerCollaborateursConnus } from "@/app/reprise-copro/collaborateurs";

const zPersonneId = z.string().trim().min(1).max(80).nullable().optional();

const schemaCreation = z.object({
  ref: z.string().trim().min(1).max(40),
  nomUsuel: z.string().trim().min(1).max(200),
  adresse: z.string().trim().max(200).optional(),
  sortant: z.string().trim().max(120).optional(),
  dateBascule: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  equipe: z
    .object({ referent: zPersonneId, gestionnaire: zPersonneId, assistant: zPersonneId, comptable: zPersonneId })
    .optional(),
});

export type CreerDossierResultat = { ok: true } | { ok: false; message: string };

export async function creerDossierAction(form: {
  ref: string;
  nomUsuel: string;
  adresse?: string;
  sortant?: string;
  dateBascule?: string;
  equipe?: Partial<Record<RoleReprise, string | null>>;
}): Promise<CreerDossierResultat> {
  const valid = schemaCreation.safeParse(form);
  if (!valid.success) {
    return { ok: false, message: "Référence et nom de la copropriété requis (200 caractères max), date au format AAAA-MM-JJ." };
  }

  const garde = await exigerAdminReprise("créer un dossier");
  if (!garde.ok) return { ok: false, message: garde.message };

  const connus = await validerCollaborateursConnus(ROLES_REPRISE.map((r) => valid.data.equipe?.[r]));
  if (!connus.ok) return connus;
  const equipe: EquipeReprise = {};
  for (const role of ROLES_REPRISE) {
    const id = valid.data.equipe?.[role];
    const p = id ? connus.personnes.get(id) : undefined;
    if (p) equipe[role] = p;
  }

  const repo = getRepriseDossierRepository();
  try {
    const adresse = valid.data.adresse?.trim() || undefined;
    const sortant = valid.data.sortant?.trim() || undefined;
    const dateBascule = valid.data.dateBascule || undefined;
    await creerDossierSuivi(repo, valid.data.ref, valid.data.nomUsuel, adresse, {
      ...(sortant ? { sortant } : {}),
      ...(dateBascule ? { dateBascule } : {}),
      ...(Object.keys(equipe).length > 0 ? { equipe } : {}),
    });
  } catch (e) {
    // Ex. dossier déjà existant (même réf). On remonte un message propre, pas un throw.
    return { ok: false, message: e instanceof Error ? e.message : "Création impossible." };
  }

  revalidatePath("/reprise-copro/dossiers");
  return { ok: true };
}
