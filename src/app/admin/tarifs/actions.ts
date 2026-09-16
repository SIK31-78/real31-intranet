"use server";

// Server Actions du panneau /admin/tarifs. RESERVEES SUPER-ADMIN (garde dans chaque
// action). Le bareme annuel : ce que la facturation, le contrat imprime et la
// proposition de contrat lisent. Les tarifs figes aux contrats signes ne bougent pas.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutEditerBareme, profilDe } from "@/lib/auth/roles";
import { enregistrerTarif, ouvrirAnnee, supprimerTarif } from "@/lib/services/admin/bareme";


import { type Res, echecDepuis } from "@/lib/actions/resultat";
async function garde(): Promise<string | null> {
  const g = await getGestionnaireCourant();
  if (!g) return "Session expirée.";
  if (!peutEditerBareme(profilDe(g))) return "Réservé à l'administration.";
  return null;
}

const zAnnee = z.number().int().min(2020).max(2100);
const zLigne = z.object({
  annee: zAnnee,
  identifiantPrestation: z.string().trim().min(2).max(60),
  libelle: z.string().trim().max(200),
  montantTtc: z.number(),
});

export async function enregistrerTarifAction(input: unknown): Promise<Res> {
  const p = zLigne.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const refus = await garde();
  if (refus) return { ok: false, erreur: refus };
  try {
    await enregistrerTarif(p.data);
    revalidatePath("/admin/tarifs");
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "admin/tarifs");
  }
}

export async function supprimerTarifAction(input: unknown): Promise<Res> {
  const p = z.object({ annee: zAnnee, identifiantPrestation: z.string().trim().min(2).max(60) }).safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const refus = await garde();
  if (refus) return { ok: false, erreur: refus };
  try {
    await supprimerTarif(p.data.annee, p.data.identifiantPrestation);
    revalidatePath("/admin/tarifs");
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "admin/tarifs");
  }
}

export async function ouvrirAnneeAction(input: unknown): Promise<Res<{ creees: number }>> {
  const p = z.object({ cible: zAnnee, source: zAnnee, majorationPourcent: z.number().min(-50).max(50).optional() }).safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const refus = await garde();
  if (refus) return { ok: false, erreur: refus };
  try {
    const creees = await ouvrirAnnee(p.data.cible, p.data.source, p.data.majorationPourcent ?? 0);
    revalidatePath("/admin/tarifs");
    return { ok: true, donnees: { creees } };
  } catch (e) {
    return echecDepuis(e, "admin/tarifs");
  }
}
