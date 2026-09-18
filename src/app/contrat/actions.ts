"use server";

// Server Action « Editer le contrat » : trace l'edition puis rend l'adresse du PDF a
// telecharger. Le document reste une route GET sans etat (contrat.pdf, apercu imprimable,
// partageables par leur URL) ; c'est l'ACTION qui ecrit, pas la route. Depuis le 18/09/2026
// le navigateur telecharge le PDF produit par le serveur, comme pour l'offre.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutEditerContrat, profilDe } from "@/lib/auth/roles";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { editerContrat } from "@/lib/services/contrat/editer-contrat";
import { type Res, echecDepuis } from "@/lib/actions/resultat";

const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Un montant TTC annuel : borne, jamais negatif (un contrat imprime ne doit pas porter -1e9). */
const MONTANT_MAX = 1_000_000;
const zMontant = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v),
  z.number().finite().min(0, "montant hors limites (0 à 1 000 000 €)").max(MONTANT_MAX, "montant hors limites (0 à 1 000 000 €)"),
);
const zEdition = z.object({
  copro: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/, "code de copropriété illisible"),
  ag: zJour.optional(),
  debut: zJour.optional(),
  fin: zJour.optional(),
  honoraires: zMontant.optional(),
  timbres: zMontant.optional(),
  frais: z.enum(["forfait", "reels"]).optional(),
});

export type EditionContrat = z.input<typeof zEdition>;

/** Trace l'edition, puis rend l'URL du PDF (et celle de l'apercu) avec les valeurs retenues. */
export async function editerContratAction(input: unknown): Promise<Res<{ pdf: string; apercu: string }>> {
  const p = zEdition.safeParse(input);
  if (!p.success) return { ok: false, erreur: `Contrat de syndic : ${p.error.issues[0]?.message ?? "saisie invalide"}.` };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  const { copro: coproCode, ag, debut, fin, honoraires, timbres, frais } = p.data;
  // Editer un contrat : l'equipe syndic et la compta, sur une copro de son perimetre
  // (audit du 16/09/2026 : l'action n'avait ni role ni cloisonnement).
  if (!peutEditerContrat(profilDe(g))) return { ok: false, erreur: "Contrat de syndic : réservé à l'équipe syndic." };
  try {
    await exigerPerimetre(coproCode, g.id);
    const fraisPostauxReels = frais === "reels";
    // Au reel, pas de forfait : le montant saisi (ou pre-rempli) ne doit pas s'imprimer.
    const forfaitPostauxTtc = fraisPostauxReels ? 0 : timbres;

    // Leve sur toute incoherence (cycle > 3 ans, bareme incomplet...) : le message revient
    // au formulaire, rien n'est trace.
    await editerContrat({
      coproCode,
      par: g.nomComplet,
      ...(ag ? { dateAgISO: ag } : {}),
      ...(debut ? { debutISO: debut } : {}),
      ...(fin ? { finISO: fin } : {}),
      ...(honoraires !== undefined ? { honorairesGestionTtc: honoraires } : {}),
      ...(forfaitPostauxTtc !== undefined ? { forfaitPostauxTtc } : {}),
      fraisPostauxReels,
    });
    revalidatePath("/contrat");
    revalidatePath(`/contrat/${coproCode}`);

    const q = new URLSearchParams();
    if (ag) q.set("ag", ag);
    if (debut) q.set("debut", debut);
    if (fin) q.set("fin", fin);
    if (honoraires !== undefined) q.set("honoraires", String(honoraires));
    if (forfaitPostauxTtc !== undefined) q.set("timbres", String(forfaitPostauxTtc));
    if (fraisPostauxReels) q.set("frais", "reels");
    const base = `/contrat/${encodeURIComponent(coproCode)}`;
    return { ok: true, donnees: { pdf: `${base}/contrat.pdf?${q}`, apercu: `${base}/imprimer?${q}` } };
  } catch (e) {
    return echecDepuis(e, "contrat");
  }
}
