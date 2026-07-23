// GET /api/v1/supervisions/{agId} - la supervision d'une AG : progression globale,
// sections, items (statut / commentaire / audite) et problemes actifs.
// Handler MINCE sur getSupervisionAg ; le cloisonnement (cle gestionnaire) est porte
// par le provider (managerId), une supervision hors perimetre repond 404 (anti-IDOR).

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { progressionGlobale, progressionSection } from "@/lib/domain/supervision-ag";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zAgId = z.string().trim().min(1).max(60);

type Ctx = { params: Promise<{ agId: string }> };

export const GET = avecCleApi<Ctx>("lecture", async (_req, ctx, acces) => {
  const { agId } = await ctx.params;
  if (!zAgId.safeParse(agId).success) {
    return erreurJson(400, "parametres_invalides", "Identifiant de supervision invalide.");
  }
  const sup = await getSupervisionAg(agId, acces.managerId || undefined);
  if (!sup) return erreurJson(404, "introuvable", "Supervision inconnue ou hors périmètre.");

  return okJson({
    supervision: {
      id: sup.id,
      copro: sup.copro,
      dateAgCible: sup.dateAgCible,
      statut: sup.statut,
      progression: progressionGlobale(sup),
      ...(sup.visa ? { visa: sup.visa } : {}),
      sections: sup.sections.map((s) => ({
        id: s.id,
        titre: s.titre,
        progression: progressionSection(s),
        items: s.items.map((i) => ({
          id: i.id,
          libelle: i.libelle,
          statut: i.statut,
          ...(i.type ? { type: i.type } : {}),
          ...(i.commentaire ? { commentaire: i.commentaire } : {}),
          ...(i.audite ? { audite: i.audite } : {}),
        })),
      })),
      problemes: sup.sections
        .flatMap((s) => s.items)
        .filter((i) => i.statut === "probleme")
        .map((i) => ({ itemId: i.id, libelle: i.libelle, ...(i.commentaire ? { commentaire: i.commentaire } : {}) })),
    },
  });
});
