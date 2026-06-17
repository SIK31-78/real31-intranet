"use server";

// Server Action du mode CS (palier 2a) : ajoute les resolutions composees dans l'AG
// eStale (ecriture reelle, additive). Passe par le service (ADR-001), cloisonne par
// gestionnaire connecte.

import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { appliquerOdjAg, creerAssembleeAg } from "@/lib/services/odj/get-assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";
import type { OrdreMotion } from "@/lib/domain/assemblee";

type ItemAjout = { id: string; titre: string; corps: string; majorite: MajoriteResolution };

type Resultat = { ok: true; supprimees: number; ajoutees: number } | { ok: false; erreur: string };

export async function enregistrerProjetAction(
  meetingId: string,
  supprimerMotionIds: string[],
  items: ItemAjout[],
  ordre: OrdreMotion[],
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
    const { supprimees, ajoutees } = await appliquerOdjAg(
      meetingId,
      supprimerMotionIds,
      bankItemIds,
      libres,
      ordre,
    );
    revalidatePath("/odj", "layout");
    return { ok: true, supprimees, ajoutees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

type ResultatCreation = { ok: true } | { ok: false; erreur: string };

/** Cree une nouvelle AG ordinaire dans eStale pour la copro (palier 3). */
export async function creerAgAction(coproCode: string): Promise<ResultatCreation> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée, reconnecte-toi." };
  try {
    await creerAssembleeAg(coproCode);
    revalidatePath("/odj", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
