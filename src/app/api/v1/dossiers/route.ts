// GET /api/v1/dossiers - les dossiers suivis (travaux, sinistre, impaye, procedure...)
// du perimetre. Filtres : ?copro=&type=&statut=. Handler MINCE sur getDossiers.
//
// PII : `cible` (nom du coproprietaire quand la portee n'est pas la copro) est
// VOLONTAIREMENT absent des reponses v1 - la portee reste visible, pas le nom.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { paginer } from "@/lib/domain/api-pagination";
import { progressionDossier } from "@/lib/domain/dossier";
import { getDossiers } from "@/lib/services/dossiers/get-dossiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zQuery = z.object({
  copro: z.string().trim().min(1).max(40).optional(),
  type: z
    .enum(["travaux", "sinistre", "impaye", "procedure", "recouvrement", "question_diverse", "autre"])
    .optional(),
  statut: z.enum(["ouvert", "en_cours", "clos"]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.string().max(5).optional(),
});

export const GET = avecCleApi("lecture", async (req, _ctx, acces) => {
  const url = new URL(req.url);
  const parse = zQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Paramètres invalides : copro, type, statut, cursor, limit.");
  }
  const { copro, type, statut, cursor, limit } = parse.data;

  // "" = vue transverse pour une cle cabinet.
  let dossiers = await getDossiers(acces.managerId ?? "");
  if (copro) dossiers = dossiers.filter((d) => d.coproCode === copro);
  if (type) dossiers = dossiers.filter((d) => d.type === type);
  if (statut) dossiers = dossiers.filter((d) => d.statut === statut);

  const page = paginer(dossiers, cursor ?? null, limit ?? null);
  return okJson({
    dossiers: page.items.map((d) => ({
      id: d.id,
      coproCode: d.coproCode,
      ...(d.coproNom ? { coproNom: d.coproNom } : {}),
      type: d.type,
      portee: d.portee,
      titre: d.titre,
      statut: d.statut,
      ouvertLe: d.ouvertLe,
      ...(d.ouvertPar ? { ouvertPar: d.ouvertPar } : {}),
      ...(d.agDate ? { agDate: d.agDate } : {}),
      ...(d.numeroResolution ? { numeroResolution: d.numeroResolution } : {}),
      progression: progressionDossier(d),
    })),
    total: page.total,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  });
});
