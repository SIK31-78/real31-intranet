"use server";

// Server Action « Editer le contrat » : trace l'edition puis ouvre le document. Le
// document reste une page GET sans etat (imprimable, partageable par son URL) ; c'est
// l'ACTION qui ecrit, pas la page.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutEditerContrat, profilDe } from "@/lib/auth/roles";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { editerContrat } from "@/lib/services/contrat/editer-contrat";

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

function jour(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return JOUR_RE.test(s) ? s : undefined;
}

/** Un montant TTC annuel : borne, jamais negatif (un contrat imprime ne doit pas porter -1e9). */
const MONTANT_MAX = 1_000_000;
function nombre(v: FormDataEntryValue | null): number | undefined {
  const s = typeof v === "string" ? v.trim().replace(",", ".") : "";
  const n = Number(s);
  if (s === "" || !Number.isFinite(n)) return undefined;
  if (n < 0 || n > MONTANT_MAX) throw new Error("Contrat de syndic : montant hors limites (0 à 1 000 000 €).");
  return n;
}

const CODE_COPRO_RE = /^[A-Za-z0-9_-]{1,20}$/;

export async function editerContratAction(formData: FormData): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const coproCode = String(formData.get("copro") ?? "").trim();
  if (!coproCode) throw new Error("Contrat de syndic : copropriété manquante.");
  if (!CODE_COPRO_RE.test(coproCode)) throw new Error("Contrat de syndic : code de copropriété illisible.");
  // Editer un contrat : l'equipe syndic et la compta, sur une copro de son perimetre
  // (audit du 16/09/2026 : l'action n'avait ni role ni cloisonnement).
  if (!peutEditerContrat(profilDe(g))) throw new Error("Contrat de syndic : réservé à l'équipe syndic.");
  await exigerPerimetre(coproCode, g.id);
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
