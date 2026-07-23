// GET /api/v1/dossiers/{id} - le detail d'un dossier : etapes + journal + equipe de la
// copro. Handler MINCE sur getDossier (cloisonnement porte par le service : un dossier
// hors perimetre de la cle repond 404, anti-IDOR).
//
// PII : `cible` (nom du coproprietaire) volontairement absent, comme sur la liste.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { progressionDossier } from "@/lib/domain/dossier";
import { getDossier } from "@/lib/services/dossiers/get-dossiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zId = z.string().trim().min(1).max(120);

type Ctx = { params: Promise<{ id: string }> };

export const GET = avecCleApi<Ctx>("lecture", async (_req, ctx, acces) => {
  const { id } = await ctx.params;
  if (!zId.safeParse(id).success) {
    return erreurJson(400, "parametres_invalides", "Identifiant de dossier invalide.");
  }
  // "" = vue transverse (cle cabinet) : findByCode sans scope.
  const vue = await getDossier(id, acces.managerId ?? "");
  if (!vue) return erreurJson(404, "introuvable", "Dossier inconnu ou hors périmètre.");

  const d = vue.dossier;
  return okJson({
    dossier: {
      id: d.id,
      coproCode: d.coproCode,
      ...(d.coproNom ? { coproNom: d.coproNom } : {}),
      type: d.type,
      portee: d.portee,
      titre: d.titre,
      statut: d.statut,
      ouvertLe: d.ouvertLe,
      ...(d.ouvertPar ? { ouvertPar: d.ouvertPar } : {}),
      ...(d.origine ? { origine: d.origine } : {}),
      ...(d.agDate ? { agDate: d.agDate } : {}),
      ...(d.numeroResolution ? { numeroResolution: d.numeroResolution } : {}),
      progression: progressionDossier(d),
      etapes: d.etapes.map((e) => ({
        id: e.id,
        label: e.label,
        fait: e.fait,
        ...(e.assigneA ? { assigneA: e.assigneA } : {}),
        ...(e.note ? { note: e.note } : {}),
      })),
      journal: d.journal,
    },
    ...(vue.gestionnaire ? { gestionnaire: vue.gestionnaire } : {}),
    ...(vue.assistant ? { assistant: vue.assistant } : {}),
  });
});
