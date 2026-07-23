// POST /api/v1/compta/{code}/{agDate}/notes - ECRITURE SURE : poser une note dans le
// fil compta d'une AG (auteur "gestionnaire", deduit de la cle liee).
// Scope `ecriture:compta` + cle OBLIGATOIREMENT liee a un gestionnaire ; le perimetre
// est re-verifie par le service (exigerPerimetre, anti-IDOR) -> 403 via le wrapper.
//
// Idempotence : header optionnel `Idempotency-Key` - rejouer le meme POST (meme cle
// API + meme Idempotency-Key) ne cree pas de doublon. BEST-EFFORT en memoire de
// process (limite documentee dans docs/api-v1.md) : un redemarrage / une autre
// instance serverless ne s'en souvient pas.

import { z } from "zod";
import { avecCleApi, erreurJson, idempotenceDejaVue, okJson } from "@/lib/auth/cle-api";
import { ajouterNoteCompta } from "@/lib/services/compta/get-compta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zParams = z.object({
  code: z.string().trim().min(1).max(40),
  agDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const zBody = z.object({ texte: z.string().trim().min(1).max(5_000) });

type Ctx = { params: Promise<{ code: string; agDate: string }> };

export const POST = avecCleApi<Ctx>("ecriture:compta", async (req, ctx, acces) => {
  const params = zParams.safeParse(await ctx.params);
  if (!params.success) {
    return erreurJson(400, "parametres_invalides", "Attendu : /compta/{code}/{AAAA-MM-JJ}/notes.");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return erreurJson(400, "parametres_invalides", "Body JSON attendu.");
  }
  const parse = zBody.safeParse(body);
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Body attendu : {texte} (1 à 5000 caractères).");
  }
  const { code, agDate } = params.data;

  // Rejeu detecte (meme cle + meme Idempotency-Key) : on repond OK sans re-ecrire.
  if (idempotenceDejaVue(acces.cle.id, req.headers.get("idempotency-key"))) {
    return okJson({ rejoue: true });
  }

  // managerId garanti par verifierAcces (toute ecriture exige une cle liee).
  await ajouterNoteCompta(
    code,
    agDate,
    "gestionnaire",
    parse.data.texte,
    acces.auteur.initiales,
    acces.managerId!,
  );
  return okJson({ rejoue: false, par: acces.auteur.initiales }, 201);
});
