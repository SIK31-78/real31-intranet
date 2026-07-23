// GET /api/v1/echeances - LE produit phare : les jalons AG du perimetre (cibles
// calculees + etat), a venir et en retard. Par defaut on ne renvoie que les jalons
// NON accomplis (le "reste a faire") ; ?tous=true inclut les accomplis.
// Filtres : ?copro= (code), ?enRetard=true. Handler MINCE sur getEcheances.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { paginer } from "@/lib/domain/api-pagination";
import { getEcheances } from "@/lib/services/jalons/get-echeances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zQuery = z.object({
  copro: z.string().trim().min(1).max(40).optional(),
  enRetard: z.enum(["true", "false"]).optional(),
  tous: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.string().max(5).optional(),
});

export const GET = avecCleApi("lecture", async (req, _ctx, acces) => {
  const url = new URL(req.url);
  const parse = zQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Paramètres invalides : copro, enRetard, tous, cursor, limit.");
  }
  const { copro, enRetard, tous, cursor, limit } = parse.data;

  let jalons = await getEcheances(acces.managerId);
  if (tous !== "true") jalons = jalons.filter((j) => j.statut !== "accompli");
  if (copro) jalons = jalons.filter((j) => j.coproCode === copro);
  if (enRetard) jalons = jalons.filter((j) => j.enRetard === (enRetard === "true"));

  const page = paginer(jalons, cursor ?? null, limit ?? null);
  return okJson({
    echeances: page.items,
    total: page.total,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  });
});
