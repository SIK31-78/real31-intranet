// GET /api/v1/copros - liste des coproprietes du perimetre de la cle + etat du cycle AG.
// Handler MINCE : auth cle machine (avecCleApi) -> zod -> service existant -> JSON.
// Cloisonnement : cle liee a un gestionnaire -> son portefeuille ; cle cabinet -> transverse.
// ZERO PII coproprietaires (champs referentiels et metier seulement).

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { paginer } from "@/lib/domain/api-pagination";
import { ETAT_CYCLE_ORDRE, type EtatCycle } from "@/lib/domain/cycle-ag";
import { getCoprosPilotage } from "@/lib/services/coproprietes/get-copros-pilotage";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zQuery = z.object({
  etat: z.enum(ETAT_CYCLE_ORDRE as [EtatCycle, ...EtatCycle[]]).optional(),
  agence: z.string().trim().min(1).max(10).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.string().max(5).optional(),
});

export const GET = avecCleApi("lecture", async (req, _ctx, acces) => {
  const url = new URL(req.url);
  const parse = zQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Paramètres invalides : etat, agence, cursor, limit.");
  }
  const { etat, agence, cursor, limit } = parse.data;

  let copros = await getCoprosPilotage(acces.managerId);
  if (etat) copros = copros.filter((c) => c.etat === etat);

  // Filtre agence : le code (ML/LGC/HLS/ASN) se resout depuis le referentiel complet
  // (une seule lecture supplementaire, uniquement quand le filtre est demande).
  if (agence) {
    const referentiel = await getCoproprietes(acces.managerId);
    const agenceParCode = new Map<string, string | undefined>();
    for (const c of referentiel) agenceParCode.set(c.code, await codeAgence(c.agenceId));
    copros = copros.filter((c) => agenceParCode.get(c.code) === agence.toUpperCase());
  }

  const tri = [...copros].sort((a, b) => a.code.localeCompare(b.code));
  const page = paginer(tri, cursor ?? null, limit ?? null);
  return okJson({
    copros: page.items.map((c) => ({
      code: c.code,
      nom: c.nom,
      ville: c.ville,
      source: c.source,
      etat: c.etat,
      enRetard: c.enRetard,
      priseEnMain: c.prise,
      ...(c.agDate ? { agDate: c.agDate } : {}),
      ...(c.derniereAgDate ? { derniereAgDate: c.derniereAgDate } : {}),
      ...(c.exerciceCloture ? { exerciceCloture: c.exerciceCloture } : {}),
    })),
    total: page.total,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  });
});
