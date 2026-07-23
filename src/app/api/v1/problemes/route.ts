// GET /api/v1/problemes - les problemes signales (items de supervision coches
// "probleme") du perimetre, groupes par copropriete. Handler MINCE sur getProblemes
// (le service du bloc "problemes signales" de l'accueil).

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { paginer } from "@/lib/domain/api-pagination";
import { getProblemes } from "@/lib/services/problemes/get-problemes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.string().max(5).optional(),
});

export const GET = avecCleApi("lecture", async (req, _ctx, acces) => {
  const url = new URL(req.url);
  const parse = zQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Paramètres invalides : cursor, limit.");
  }
  // "" = vue transverse pour une cle cabinet.
  const problemes = await getProblemes(acces.managerId ?? "");
  const page = paginer(problemes, parse.data.cursor ?? null, parse.data.limit ?? null);
  return okJson({
    problemes: page.items,
    total: page.total,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  });
});
