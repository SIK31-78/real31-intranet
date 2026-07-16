"use server";

// Server Action du mode CS (palier 2a) : ajoute les resolutions composees dans l'AG
// Estale (ecriture reelle, additive). Passe par le service (ADR-001), cloisonne par
// gestionnaire connecte.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { appliquerOdjAg, creerAssembleeAg } from "@/lib/services/odj/get-assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";

type ItemAjout = { id: string; titre: string; corps: string; majorite: MajoriteResolution };

type Resultat =
  | { ok: true; supprimees: number; ajoutees: number; dejaPresentes: number }
  | { ok: false; erreur: string };

// Validation des entrees (zod). Ces actions ECRIVENT dans l'AG Estale : on borne tout.
const zCode = z.string().trim().min(1).max(40);
const zMeeting = z.string().trim().min(1).max(120);
const zIds = z.array(z.string().trim().min(1).max(200)).max(500);
const zMajorite = z.enum(["A24", "A25", "A25_1", "A26", "A26_1", "UNANIMITY", "QUESTION"]);
const zItems = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(200),
      titre: z.string().max(2_000),
      corps: z.string().max(50_000),
      majorite: zMajorite,
    }),
  )
  .max(500);

/**
 * Cloisonnement : l'appelant doit gerer cette copro. Sans ce garde, un gestionnaire
 * connecte pourrait ecrire dans l'AG Estale de n'importe quelle copro (IDOR).
 * En mock (COPRO_SOURCE != supabase) on ne cloisonne pas.
 */
async function gererCopro(
  coproCode: string,
): Promise<{ ok: true; managerId: string } | { ok: false; erreur: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée, reconnecte-toi." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, erreur: "Copropriété hors de ton périmètre." };
  }
  return { ok: true, managerId: g.id };
}

export async function enregistrerProjetAction(
  coproCode: string,
  meetingId: string,
  supprimerMotionIds: string[],
  items: ItemAjout[],
  ordreTopExistant: string[],
): Promise<Resultat> {
  const valid = z
    .object({
      coproCode: zCode,
      meetingId: zMeeting,
      supprimerMotionIds: zIds,
      items: zItems,
      ordreTopExistant: zIds,
    })
    .safeParse({ coproCode, meetingId, supprimerMotionIds, items, ordreTopExistant });
  if (!valid.success) return { ok: false, erreur: "Données invalides." };
  const garde = await gererCopro(coproCode);
  if (!garde.ok) return garde;
  if (!meetingId) return { ok: false, erreur: "Aucune AG Estale cible." };

  // Les ids "libre-*" sont des resolutions saisies ; les autres sont des ids de bank.
  const bankItemIds = items.filter((i) => !i.id.startsWith("libre-")).map((i) => i.id);
  const libres = items
    .filter((i) => i.id.startsWith("libre-"))
    .map((i) => ({ titre: i.titre, corps: i.corps, majorite: i.majorite }));

  try {
    const { supprimees, ajoutees, dejaPresentes } = await appliquerOdjAg(
      coproCode,
      meetingId,
      supprimerMotionIds,
      bankItemIds,
      libres,
      ordreTopExistant,
      garde.managerId,
    );
    revalidatePath("/odj", "layout");
    return { ok: true, supprimees, ajoutees, dejaPresentes };
  } catch (e) {
    // Le message de l'adapter est deja explicite en cas d'echec partiel ("relance pour
    // completer, rien ne sera duplique") : on le remonte tel quel a l'UI.
    return { ok: false, erreur: (e as Error).message };
  }
}

type ResultatCreation = { ok: true } | { ok: false; erreur: string };

/** Cree une nouvelle AG ordinaire dans Estale pour la copro (palier 3). */
export async function creerAgAction(coproCode: string): Promise<ResultatCreation> {
  if (!zCode.safeParse(coproCode).success) return { ok: false, erreur: "Données invalides." };
  const garde = await gererCopro(coproCode);
  if (!garde.ok) return garde;
  try {
    await creerAssembleeAg(coproCode, garde.managerId);
    revalidatePath("/odj", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
