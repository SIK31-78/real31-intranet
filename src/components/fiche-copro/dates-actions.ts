"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { confirmerEvenement } from "@/lib/services/coproprietes/confirmation-evenement";
import { reporterSupervisionSansDate } from "@/lib/services/supervision-ag/reporter-sans-date";
import { reporterOdjSansDate } from "@/lib/services/odj/saisir-champ-odj";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";

const zCode = z.string().trim().min(1).max(40);
const zDate = z.string().trim().max(40); // ISO ou vide (= effacer la date)
const zTypeEvenement = z.enum(["AG", "CS"]);

// Modifie une date d'AG / CS (ecrit dans public.Copropriete, partage App A).
// `quand` = prochaine (planifiee) ou derniere (tenue, correction du referentiel App A).
// Cloisonne : garde coproAppartient au niveau action (le scope managerId de l'adapter
// ne protege que l'UPDATE principal ; les follow-ups reporter* tournent sinon hors scope).
async function definir(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string,
): Promise<void> {
  if (!z.object({ coproCode: zCode, dateISO: zDate }).safeParse({ coproCode, dateISO }).success) return;
  const g = await getGestionnaireCourant();
  if (!g) return;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return;
  await definirDateEvenement(coproCode, type, quand, dateISO || null, g.id);
  // (Re)fixer la PROCHAINE date d'AG reporte les prepas "sans date" (supervision + ODJ).
  // Corriger la derniere AG tenue est une mise a jour du referentiel : pas de report.
  if (type === "ag" && quand === "prochaine" && dateISO) {
    await reporterSupervisionSansDate(coproCode, dateISO, g.id);
    await reporterOdjSansDate(coproCode, dateISO, g.id);
  }
  // Changer une date recalcule les jalons : revalider TOUTES les vues qui les affichent
  // (sinon le calendrier / dashboard / Actions restent sur l'ancien calcul).
  revalidatePath(`/copropriete/${coproCode}`);
  revalidatePath("/calendrier");
  revalidatePath("/dashboard");
  revalidatePath("/mes-evenements");
}

export async function definirDateAg(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
): Promise<void> {
  await definir(coproCode, "ag", quand, dateISO);
}
export async function definirDateCs(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
): Promise<void> {
  await definir(coproCode, "cs", quand, dateISO);
}

// Confirme la prochaine date AG/CS : le conseil syndical a valide par retour de mail.
// La date confirmee est RELUE cote serveur dans le referentiel (jamais prise du client).
// Cloisonne : coproAppartient avant toute ecriture (anti-IDOR).
export async function confirmerEvenementAction(
  coproCode: string,
  type: "AG" | "CS",
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!z.object({ coproCode: zCode, type: zTypeEvenement }).safeParse({ coproCode, type }).success)
    return { ok: false, erreur: "Données invalides." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    const date = await confirmerEvenement(coproCode, type, g.initiales, g.id);
    if (!date) return { ok: false, erreur: "Aucune date à confirmer." };
    revalidatePath(`/copropriete/${coproCode}`);
    revalidatePath("/calendrier");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
