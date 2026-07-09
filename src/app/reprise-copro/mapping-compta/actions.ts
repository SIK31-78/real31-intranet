"use server";

// Server Actions de la REVUE du mapping comptable. Contrat uniforme {ok,...} : jamais de throw
// cote client. Validation Zod (bornage + union stricte des decisions). Cloisonnement : un
// gestionnaire connecte est exige (getGestionnaireCourant) - PAS de check coproAppartient (une
// reprise concerne une copro PAS ENCORE dans le perimetre eStale).
//
// Ces actions ne transportent que du JSON leger (une decision) : elles persistent le geste
// humain. Le recalcul du plan (pretAImporter) est PUR et se fait cote client/domaine
// (appliquerDecisions). AUCUNE ecriture eStale.
//
// PII : le motif d'un "ignorer" est stocke (base interne) mais JAMAIS logue.

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getMappingDecisionRepository } from "@/lib/reprise/adapters/router";
import type { DecisionMapping } from "@/lib/reprise/domain/decisions-mapping";

export type ActionResultat = { ok: true } | { ok: false; message: string };

const zDecision = z.discriminatedUnion("type", [
  z.object({ type: z.literal("valider_candidat") }),
  z.object({ type: z.literal("choisir_cible"), nomenclature: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("creer_fournisseur") }),
  z.object({ type: z.literal("creer_compte_separe"), owner: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("ignorer"), motif: z.string().trim().min(1).max(300) }),
]);

const zCoproCode = z.string().trim().min(1).max(40);
const zCompteSource = z.string().trim().min(1).max(60);

/** Persiste (upsert) la decision humaine tranchee pour un compte source. */
export async function enregistrerDecisionAction(
  coproCode: string,
  compteSource: string,
  decision: DecisionMapping,
): Promise<ActionResultat> {
  const codeOk = zCoproCode.safeParse(coproCode);
  const compteOk = zCompteSource.safeParse(compteSource);
  const decisionOk = zDecision.safeParse(decision);
  if (!codeOk.success || !compteOk.success || !decisionOk.success) {
    return { ok: false, message: "Decision invalide." };
  }

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour trancher ce compte." };

  try {
    await getMappingDecisionRepository().enregistrer(codeOk.data, {
      compteSource: compteOk.data,
      decision: decisionOk.data,
      decideur: g.id,
      decidedAt: new Date().toISOString(),
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Enregistrement impossible." };
  }
  return { ok: true };
}

/** Retire la decision d'un compte source (retour a l'etat automatique). */
export async function oublierDecisionAction(
  coproCode: string,
  compteSource: string,
): Promise<ActionResultat> {
  const codeOk = zCoproCode.safeParse(coproCode);
  const compteOk = zCompteSource.safeParse(compteSource);
  if (!codeOk.success || !compteOk.success) {
    return { ok: false, message: "Compte invalide." };
  }

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour annuler cette decision." };

  try {
    await getMappingDecisionRepository().supprimer(codeOk.data, compteOk.data);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Annulation impossible." };
  }
  return { ok: true };
}
