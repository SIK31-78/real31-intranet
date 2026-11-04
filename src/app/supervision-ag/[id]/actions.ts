"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StatutItem } from "@/lib/domain/supervision-ag";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import {
  cocherItem,
  commenterItem,
} from "@/lib/services/supervision-ag/mettre-a-jour-item";
import { conclureAg } from "@/lib/services/supervision-ag/conclure-ag";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { ITEM_CS_PREPA, ITEM_CONVOC_DATE } from "@/lib/domain/supervision-ag-template";
import { marquerJalon } from "@/lib/services/jalons/marquer-jalon";

// Validation des entrees (zod) : ces Server Actions sont des endpoints POST publics.
const zAgId = z.string().trim().min(1).max(120); // "CODE__YYYY-MM-DD" (ou id simple en mock)
const zItemId = z.string().trim().min(1).max(120);
const zStatut = z.enum(["non_verifie", "ok", "probleme", "non_applicable"]);
const zCommentaire = z.string().max(5000);

// L'id de supervision est "CODE__DATE" en reel ; en mock c'est un id simple (e1).
function codeDe(agId: string): string {
  const i = agId.indexOf("__");
  return i < 0 ? agId : agId.slice(0, i);
}
/** Date de l'AG portee par l'id "CODE__YYYY-MM-DD" (null si id simple, ex mock). */
function dateDe(agId: string): string | null {
  const i = agId.indexOf("__");
  return i < 0 ? null : agId.slice(i + 2);
}

/** Gestionnaire courant s'il est autorise sur cette supervision, sinon null. */
async function autorise(agId: string): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  if (process.env.COPRO_SOURCE !== "supabase") return g; // pas de cloisonnement en mock
  return (await coproAppartient(codeDe(agId), g.id)) ? g : null;
}

export async function cocherItemAction(
  agId: string,
  itemId: string,
  statut: StatutItem,
): Promise<void> {
  if (!z.object({ agId: zAgId, itemId: zItemId, statut: zStatut }).safeParse({ agId, itemId, statut }).success) return;
  const g = await autorise(agId);
  if (!g) return;
  await cocherItem(agId, itemId, statut, { initiales: g.initiales }, g.id);
  revalidatePath(`/supervision-ag/${agId}`);
}

export async function commenterItemAction(
  agId: string,
  itemId: string,
  commentaire: string,
): Promise<void> {
  if (!z.object({ agId: zAgId, itemId: zItemId, commentaire: zCommentaire }).safeParse({ agId, itemId, commentaire }).success)
    return;
  const g = await autorise(agId);
  if (!g) return;
  await commenterItem(agId, itemId, commentaire, { initiales: g.initiales }, g.id);
  // Le "CS preparatoire le" alimente la date de prochain CS de la copro (calendrier).
  if (itemId === ITEM_CS_PREPA) {
    const code = codeDe(agId);
    await definirDateEvenement(code, "cs", "prochaine", commentaire || null, g.id);
    revalidatePath(`/copropriete/${code}`);
    revalidatePath("/calendrier");
  }
  // "Date de convocation" renseignee = convocation faite : on coche le jalon CONVOC pour que
  // l'AG passe "Convoquee" (l'etat se lit sur ce jalon, cf. etatCycleAg). Effacer la date
  // ne decoche rien : le jalon peut aussi avoir ete confirme depuis l'accueil.
  if (itemId === ITEM_CONVOC_DATE && /^\d{4}-\d{2}-\d{2}$/.test(commentaire)) {
    const code = codeDe(agId);
    const agDate = dateDe(agId);
    if (agDate) {
      await marquerJalon({ coproCode: code, agDate, type: "CONVOC", statut: "accompli", par: g.initiales }, g.id);
      revalidatePath(`/copropriete/${code}`);
      revalidatePath("/accueil");
    }
  }
  revalidatePath(`/supervision-ag/${agId}`);
}

export async function conclureAgAction(agId: string): Promise<void> {
  if (!zAgId.safeParse(agId).success) return;
  const g = await autorise(agId);
  if (!g) return;
  await conclureAg(agId, {
    initiales: g.initiales,
    le: new Date().toLocaleDateString("fr-FR"),
  }, g.id);

  // AG tenue + dossier boucle : la date planifiee devient la "derniere AG", et on
  // efface la "prochaine AG" (la copro repasse "a planifier" pour le cycle suivant).
  const code = codeDe(agId);
  const agDate = dateDe(agId);
  if (agDate) {
    await definirDateEvenement(code, "ag", "derniere", agDate, g.id);
    await definirDateEvenement(code, "ag", "prochaine", null, g.id);
    revalidatePath(`/copropriete/${code}`);
    revalidatePath("/calendrier");
    revalidatePath("/accueil");
  }

  revalidatePath(`/supervision-ag/${agId}`);
}
