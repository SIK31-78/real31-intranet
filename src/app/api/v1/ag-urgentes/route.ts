// GET /api/v1/ag-urgentes - le bandeau "AG les plus urgentes" : pour chaque copro
// imminente, l'ACTION DU MOMENT derivee du cycle AG (LA source unique domain/cycle-ag),
// l'echeance courte et le retard. Handler MINCE sur getAgSemaine (le service du bandeau
// d'accueil) - aucune logique d'urgence dupliquee ici.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { paginer } from "@/lib/domain/api-pagination";
import { getAgSemaine } from "@/lib/services/affaires/get-ag-semaine";

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
  // "" = vue transverse pour une cle cabinet (meme convention list() que les services).
  const lignes = await getAgSemaine(acces.managerId ?? "");
  const page = paginer(lignes, parse.data.cursor ?? null, parse.data.limit ?? null);
  return okJson({
    agUrgentes: page.items.map((l) => ({
      coproCode: l.coproCode,
      coproNom: l.coproNom,
      prochaineAction: l.prochaineAction,
      actionLabel: l.actionLabel,
      lien: l.lien,
      enRetard: l.enRetard,
      ...(l.echeance ? { echeance: l.echeance } : {}),
    })),
    total: page.total,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  });
});
