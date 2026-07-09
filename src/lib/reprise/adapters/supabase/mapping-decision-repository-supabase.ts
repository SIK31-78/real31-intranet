// Adapter Supabase du MappingDecisionRepository (revue du mapping comptable). Une ligne par
// decision dans public.reprise_mapping_decision (base patron mutualisee) : cle composite
// (copro_code, compte_source), la decision serialisee en JSONB. Le SDK @supabase/supabase-js
// est CONFINE ici (isolation hexagonale). Acces via service_role (bypass RLS) comme les autres
// tables natives de l'intranet (cf. reprise_dossier).
//
// Degradation propre : si la table n'existe pas encore (42P01 / PGRST205 / schema cache), la
// lecture renvoie vide et l'ecriture est un no-op silencieux (pas de crash de page) - le module
// marche AVANT que le SQL soit execute (cf. supabase/sql/reprise_mapping_decision.sql).
//
// PII : la decision peut porter un motif libre (ignorer). Il est stocke tel quel (base interne)
// mais JAMAIS logue.

import type { DecisionEntree, DecisionMapping } from "@/lib/reprise/domain/decisions-mapping";
import type { MappingDecisionRepository } from "@/lib/reprise/ports/mapping-decision-repository";
import { createSupabasePublicClient } from "@/lib/adapters/supabase/public-client";

const TABLE = "reprise_mapping_decision";

/** true si l'erreur Supabase signale une table absente (SQL pas encore execute). */
function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

interface LigneDecision {
  copro_code: string;
  compte_source: string;
  decision: DecisionMapping;
  decideur: string | null;
  decided_at: string | null;
}

function versEntree(l: LigneDecision): DecisionEntree {
  return {
    compteSource: l.compte_source,
    decision: l.decision,
    ...(l.decideur ? { decideur: l.decideur } : {}),
    ...(l.decided_at ? { decidedAt: l.decided_at } : {}),
  };
}

export class MappingDecisionRepositorySupabase implements MappingDecisionRepository {
  async lister(coproCode: string): Promise<DecisionEntree[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("copro_code, compte_source, decision, decideur, decided_at")
      .eq("copro_code", coproCode);
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`Reprise lister decisions mapping : ${error.message}`);
    }
    return ((data as LigneDecision[] | null) ?? []).map(versEntree);
  }

  async enregistrer(coproCode: string, entree: DecisionEntree): Promise<void> {
    const sb = createSupabasePublicClient();
    const ligne = {
      copro_code: coproCode,
      compte_source: entree.compteSource,
      decision: entree.decision,
      decideur: entree.decideur ?? null,
      decided_at: entree.decidedAt ?? new Date().toISOString(),
    };
    const { error } = await sb.from(TABLE).upsert(ligne, { onConflict: "copro_code,compte_source" });
    if (error && !tableAbsente(error)) {
      throw new Error(`Reprise enregistrer decision mapping : ${error.message}`);
    }
  }

  async supprimer(coproCode: string, compteSource: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq("copro_code", coproCode)
      .eq("compte_source", compteSource);
    if (error && !tableAbsente(error)) {
      throw new Error(`Reprise supprimer decision mapping : ${error.message}`);
    }
  }
}
