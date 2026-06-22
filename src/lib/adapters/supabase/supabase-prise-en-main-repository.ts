// Adapter Supabase de la prise en main (table native intranet_copro_prise_en_main,
// base patron, service_role). Si la table n'existe pas encore (SQL pas lance), la
// lecture renvoie null -> la fonctionnalite est inerte (tout considere pris en main).

import type { PriseEnMainRepository } from "@/lib/ports/prise-en-main-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_copro_prise_en_main";

export class SupabasePriseEnMainRepository implements PriseEnMainRepository {
  async getConfirmees(coproCodes: string[]): Promise<Set<string> | null> {
    if (coproCodes.length === 0) return new Set();
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("copropriete_id")
      .in("copropriete_id", coproCodes);
    if (error) return null; // table absente / non deployee -> feature inerte
    return new Set((data as { copropriete_id: string }[]).map((r) => r.copropriete_id));
  }

  async confirmer(coproCode: string, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from(TABLE).upsert(
      { copropriete_id: coproCode, confirme_par: par, confirme_at: new Date().toISOString() },
      { onConflict: "copropriete_id" },
    );
    if (error) throw new Error(`prise en main : ${error.message}`);
  }

  async annuler(coproCode: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    await supabase.from(TABLE).delete().eq("copropriete_id", coproCode);
  }
}
