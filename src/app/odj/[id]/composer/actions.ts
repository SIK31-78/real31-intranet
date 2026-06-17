"use server";

// Server Action du mode CS (palier 2a) : ajoute les resolutions composees dans l'AG
// eStale (ecriture reelle, additive). Passe par le service (ADR-001), cloisonne par
// gestionnaire connecte.

import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { ajouterResolutionsAg } from "@/lib/services/odj/get-assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";

type ItemAjout = { id: string; titre: string; corps: string; majorite: MajoriteResolution };

type Resultat = { ok: true; ajoutees: number } | { ok: false; erreur: string };

export async function enregistrerProjetAction(
  meetingId: string,
  items: ItemAjout[],
): Promise<Resultat> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée, reconnecte-toi." };
  if (!meetingId) return { ok: false, erreur: "Aucune AG eStale cible." };

  // Les ids "libre-*" sont des resolutions saisies ; les autres sont des ids de bank.
  const bankItemIds = items.filter((i) => !i.id.startsWith("libre-")).map((i) => i.id);
  const libres = items
    .filter((i) => i.id.startsWith("libre-"))
    .map((i) => ({ titre: i.titre, corps: i.corps, majorite: i.majorite }));

  try {
    const ajoutees = await ajouterResolutionsAg(meetingId, bankItemIds, libres);
    revalidatePath("/odj", "layout");
    return { ok: true, ajoutees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
