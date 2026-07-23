// POST /api/v1/supervisions/{agId}/items/{itemId} - ECRITURE SURE : cocher un item
// de supervision (ok / probleme / non_applicable), commentaire optionnel.
// Scope `ecriture:supervision` + cle OBLIGATOIREMENT liee a un gestionnaire (regle
// domain/cle-api) ; le perimetre est re-verifie par le service (exigerPerimetre,
// anti-IDOR) - un refus repond 403 hors_perimetre via le wrapper.
// Idempotente-friendly : rejouer le meme statut aboutit au meme etat final.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { cocherItem, commenterItem } from "@/lib/services/supervision-ag/mettre-a-jour-item";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zParams = z.object({
  agId: z.string().trim().min(1).max(60),
  itemId: z.string().trim().min(1).max(80),
});
// L'API n'accepte PAS "non_verifie" (revenir en arriere est un geste d'UI, pas de machine).
const zBody = z.object({
  statut: z.enum(["ok", "probleme", "non_applicable"]),
  commentaire: z.string().max(2_000).optional(),
});

type Ctx = { params: Promise<{ agId: string; itemId: string }> };

export const POST = avecCleApi<Ctx>("ecriture:supervision", async (req, ctx, acces) => {
  const params = zParams.safeParse(await ctx.params);
  if (!params.success) return erreurJson(400, "parametres_invalides", "Identifiants invalides.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return erreurJson(400, "parametres_invalides", "Body JSON attendu.");
  }
  const parse = zBody.safeParse(body);
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Body attendu : {statut: ok|probleme|non_applicable, commentaire?}.");
  }
  const { agId, itemId } = params.data;
  const { statut, commentaire } = parse.data;
  const auditeur = { initiales: acces.auteur.initiales };

  try {
    // managerId garanti par verifierAcces (toute ecriture exige une cle liee).
    await cocherItem(agId, itemId, statut, auditeur, acces.managerId!);
    if (commentaire !== undefined) {
      await commenterItem(agId, itemId, commentaire, auditeur, acces.managerId!);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Écriture refusée.";
    if (/inconnu/i.test(message)) return erreurJson(404, "introuvable", message);
    if (/conclue/i.test(message)) return erreurJson(409, "ag_conclue", message);
    throw e; // hors_perimetre / erreur interne : normalises par le wrapper
  }

  return okJson({
    item: { agId, itemId, statut, ...(commentaire !== undefined ? { commentaire } : {}) },
    par: acces.auteur.initiales,
  });
});
