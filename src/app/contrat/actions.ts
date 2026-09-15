"use server";

// Server Action « Editer le contrat » : trace l'edition puis ouvre le document. Le
// document reste une page GET sans etat (imprimable, partageable par son URL) ; c'est
// l'ACTION qui ecrit, pas la page.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { editerContrat } from "@/lib/services/contrat/editer-contrat";

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

function jour(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return JOUR_RE.test(s) ? s : undefined;
}

function nombre(v: FormDataEntryValue | null): number | undefined {
  const s = typeof v === "string" ? v.trim().replace(",", ".") : "";
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : undefined;
}

export async function editerContratAction(formData: FormData): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const coproCode = String(formData.get("copro") ?? "").trim();
  if (!coproCode) throw new Error("Contrat de syndic : copropriété manquante.");
  const dateAgISO = jour(formData.get("ag"));
  const debutISO = jour(formData.get("debut"));
  const finISO = jour(formData.get("fin"));
  const honorairesGestionTtc = nombre(formData.get("honoraires"));
  const fraisPostauxReels = formData.get("frais") === "reels";
  // Au reel, pas de forfait : le montant saisi (ou pre-rempli) ne doit pas s'imprimer.
  const forfaitPostauxTtc = fraisPostauxReels ? 0 : nombre(formData.get("timbres"));

  // Leve sur toute incoherence (cycle > 3 ans, bareme incomplet...) : Next affiche
  // l'erreur, rien n'est trace.
  await editerContrat({
    coproCode,
    par: g.nomComplet,
    ...(dateAgISO ? { dateAgISO } : {}),
    ...(debutISO ? { debutISO } : {}),
    ...(finISO ? { finISO } : {}),
    ...(honorairesGestionTtc !== undefined ? { honorairesGestionTtc } : {}),
    ...(forfaitPostauxTtc !== undefined ? { forfaitPostauxTtc } : {}),
    fraisPostauxReels,
  });
  revalidatePath("/contrat");
  revalidatePath(`/contrat/${coproCode}`);

  const q = new URLSearchParams();
  if (dateAgISO) q.set("ag", dateAgISO);
  if (debutISO) q.set("debut", debutISO);
  if (finISO) q.set("fin", finISO);
  if (honorairesGestionTtc !== undefined) q.set("honoraires", String(honorairesGestionTtc));
  if (forfaitPostauxTtc !== undefined) q.set("timbres", String(forfaitPostauxTtc));
  if (fraisPostauxReels) q.set("frais", "reels");
  redirect(`/contrat/${encodeURIComponent(coproCode)}/imprimer?${q.toString()}`);
}
