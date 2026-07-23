// GET /api/v1/compta/echanges - les echanges comptables OUVERTS : par copro (AG a
// venir), le nombre de notes non resolues du fil gestionnaire <-> comptable + les
// flags de preparation. Handler MINCE sur listerAgAPreparer (la file du pole compta),
// filtre aux copros qui ont au moins une note ouverte.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { paginer } from "@/lib/domain/api-pagination";
import { listerAgAPreparer } from "@/lib/services/compta/get-compta";

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
  const file = await listerAgAPreparer(acces.managerId ?? "");
  const ouverts = file.filter((a) => a.notesOuvertes > 0);
  const page = paginer(ouverts, parse.data.cursor ?? null, parse.data.limit ?? null);
  return okJson({
    echanges: page.items,
    total: page.total,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  });
});
