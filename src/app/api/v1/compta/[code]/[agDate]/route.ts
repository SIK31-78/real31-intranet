// GET /api/v1/compta/{code}/{agDate} - l'etat compta d'une AG : flags (comptes
// verifies / envoyer avant), checklist des postes (statuts + progression + statut
// global) et fil de notes. Handler MINCE sur getEtatCompta ; l'appartenance de la
// copro au perimetre de la cle est verifiee via getCoproCompta (anti-IDOR).

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { progressionChecklist, statutGlobalChecklist } from "@/lib/domain/compta";
import { getCoproCompta, getEtatCompta } from "@/lib/services/compta/get-compta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zParams = z.object({
  code: z.string().trim().min(1).max(40),
  agDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Ctx = { params: Promise<{ code: string; agDate: string }> };

export const GET = avecCleApi<Ctx>("lecture", async (_req, ctx, acces) => {
  const parse = zParams.safeParse(await ctx.params);
  if (!parse.success) {
    return erreurJson(400, "parametres_invalides", "Attendu : /compta/{code}/{AAAA-MM-JJ}.");
  }
  const { code, agDate } = parse.data;

  // Cle gestionnaire : copro hors portefeuille -> 404 (anti-IDOR, on ne revele rien).
  // Cle cabinet : resolution transverse (meme regle que le pole comptable).
  const copro = acces.managerId
    ? await getCoproCompta(code, acces.managerId)
    : await getCoproCompta(code, "", { transverse: true });
  if (!copro) return erreurJson(404, "introuvable", "Copropriété inconnue ou hors périmètre.");

  const etat = await getEtatCompta(code, agDate);
  return okJson({
    coproCode: code,
    coproNom: copro.nom,
    agDate,
    comptesVerifies: etat.comptesVerifies,
    envoyerAvant: etat.envoyerAvant,
    checks: etat.checks,
    statutChecklist: statutGlobalChecklist(etat.checks),
    progression: progressionChecklist(etat.checks),
    notes: etat.notes.map((n) => ({
      id: n.id,
      auteur: n.auteur,
      texte: n.texte,
      resolu: n.resolu,
      createdAt: n.createdAt,
      ...(n.marquePar ? { marquePar: n.marquePar } : {}),
    })),
  });
});
