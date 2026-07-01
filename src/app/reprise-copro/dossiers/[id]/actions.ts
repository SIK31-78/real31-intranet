"use server";

// Server Actions de la fiche dossier de reprise. Contrat uniforme {ok,...} : jamais de
// throw cote client. Validation Zod (bornage + enum du statut d'etape). Cloisonnement :
// on exige un gestionnaire connecte (getGestionnaireCourant).
//
// NB : une reprise concerne une copro PAS ENCORE dans le perimetre eStale -> PAS de
// check coproAppartient ici. Un gestionnaire authentifie suffit.
//
// Le domaine est pur (pas d'horloge) : la date du journal est fabriquee ICI (ISO) et
// passee a ajouterJournal(repo, ref, date, texte).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getRepriseDossierRepository } from "@/lib/reprise/adapters/router";
import { majEtape, ajouterJournal } from "@/lib/reprise/services/suivi-dossier";

export type ActionResultat = { ok: true } | { ok: false; message: string };

const schemaMajEtape = z.object({
  dossierId: z.string().trim().min(1).max(40),
  etapeCode: z.string().trim().min(1).max(20),
  statut: z.enum(["a_faire", "en_cours", "fait", "ignore"]),
});

const schemaNote = z.object({
  dossierId: z.string().trim().min(1).max(40),
  texte: z.string().trim().min(1).max(500),
});

/** Change le statut d'une etape (par code, ex. "P3"). */
export async function majEtapeAction(
  dossierId: string,
  etapeCode: string,
  statut: string,
): Promise<ActionResultat> {
  const valid = schemaMajEtape.safeParse({ dossierId, etapeCode, statut });
  if (!valid.success) {
    return { ok: false, message: "Etape ou statut invalide." };
  }

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour modifier ce dossier." };

  const repo = getRepriseDossierRepository();
  try {
    await majEtape(repo, valid.data.dossierId, valid.data.etapeCode, valid.data.statut);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Mise a jour impossible." };
  }

  revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
  revalidatePath("/reprise-copro/dossiers");
  return { ok: true };
}

/** Ajoute une note au journal du dossier (date ISO fabriquee ici). */
export async function ajouterNoteAction(dossierId: string, texte: string): Promise<ActionResultat> {
  const valid = schemaNote.safeParse({ dossierId, texte });
  if (!valid.success) {
    return { ok: false, message: "Note requise (500 caracteres max)." };
  }

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour ajouter une note." };

  const repo = getRepriseDossierRepository();
  try {
    await ajouterJournal(repo, valid.data.dossierId, new Date().toISOString(), valid.data.texte);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ajout impossible." };
  }

  revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
  return { ok: true };
}
