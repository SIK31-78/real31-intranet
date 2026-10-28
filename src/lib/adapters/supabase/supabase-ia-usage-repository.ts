// Adapter Supabase du journal d'usage de l'IA (table intranet_ia_usage, ADR-051,
// supabase/sql/intranet_ia_usage.sql). Jamais de texte de mail : des compteurs.
// Table absente (SQL pas encore passé) : l'écriture ne fait rien, le comptage rend null (pas
// de plafond), et c'est signalé une fois par instance. La reformulation marche sans.

import type { IaUsageRepository, LigneUsageIa } from "@/lib/ports/ia-usage-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_ia_usage";
export const SQL_IA_USAGE = "supabase/sql/intranet_ia_usage.sql";

type ErreurPg = { code?: string; message: string } | null;

function tableAbsente(error: ErreurPg): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

let absenceSignalee = false;
function signalerAbsence(): void {
  if (absenceSignalee) return;
  absenceSignalee = true;
  console.warn(`[ia-usage] table ${TABLE} absente : journal d'usage et plafond quotidien inactifs (SQL à passer : ${SQL_IA_USAGE})`);
}

export class SupabaseIaUsageRepository implements IaUsageRepository {
  async enregistrer(l: LigneUsageIa): Promise<void> {
    const { error } = await createSupabasePublicClient()
      .from(TABLE)
      .insert({
        fonction: l.fonction,
        gestionnaire_id: l.gestionnaireId,
        initiales: l.initiales,
        incarnation: l.incarnation,
        modele: l.modele,
        tokens_entree: l.tokensEntree,
        tokens_sortie: l.tokensSortie,
        cout_estime: l.coutEstime,
        duree_ms: l.dureeMs,
        succes: l.succes,
        erreur: l.erreur,
        jour: l.jour,
      });
    if (!error) return;
    if (tableAbsente(error)) return signalerAbsence();
    throw new Error(`Journal d'usage IA : ${error.message}`);
  }

  async compterDuJour(gestionnaireId: string, fonction: string, jour: string): Promise<number | null> {
    const { count, error } = await createSupabasePublicClient()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("gestionnaire_id", gestionnaireId)
      .eq("fonction", fonction)
      .eq("jour", jour);
    if (!error) return count ?? 0;
    if (tableAbsente(error)) {
      signalerAbsence();
      return null;
    }
    throw new Error(`Journal d'usage IA : ${error.message}`);
  }
}
