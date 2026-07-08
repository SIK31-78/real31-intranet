// Adapter Supabase de la confirmation des dates AG/CS (table native
// intranet_confirmations_evenement, base patron, service_role). Si la table n'existe
// pas encore (SQL pas lance), la fonctionnalite degrade proprement : lecture -> vide,
// ecriture -> no-op silencieux (l'app fonctionne comme avant).

import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import type { ConfirmationEvenementRepository } from "@/lib/ports/confirmation-evenement-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_confirmations_evenement";
const COLONNES = "copro_code, type, date_evenement, statut, confirme_le, confirme_par";

type Row = {
  copro_code: string;
  type: "AG" | "CS";
  date_evenement: string;
  statut: "a_confirmer" | "confirme";
  confirme_le: string | null;
  confirme_par: string | null;
};

function versDomaine(r: Row): ConfirmationEvenement {
  return {
    coproCode: r.copro_code,
    type: r.type,
    date: r.date_evenement,
    statut: r.statut,
    ...(r.confirme_le ? { confirmeLe: r.confirme_le } : {}),
    ...(r.confirme_par ? { confirmePar: r.confirme_par } : {}),
  };
}

export class SupabaseConfirmationEvenementRepository implements ConfirmationEvenementRepository {
  async getPourCopros(codes: string[]): Promise<ConfirmationEvenement[]> {
    if (codes.length === 0) return [];
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from(TABLE).select(COLONNES).in("copro_code", codes);
    if (error) return []; // table absente / non deployee -> feature inerte
    return (data as Row[]).map(versDomaine);
  }

  async get(coproCode: string): Promise<ConfirmationEvenement[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from(TABLE).select(COLONNES).eq("copro_code", coproCode);
    if (error) return [];
    return (data as Row[]).map(versDomaine);
  }

  async confirmer(coproCode: string, type: "AG" | "CS", date: string, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    // Erreur (table absente) avalee : ecriture no-op tant que le SQL n'est pas lance.
    await supabase.from(TABLE).upsert(
      {
        copro_code: coproCode,
        type,
        date_evenement: date,
        statut: "confirme",
        confirme_le: new Date().toISOString(),
        confirme_par: par,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "copro_code,type" },
    );
  }

  async proposer(coproCode: string, type: "AG" | "CS", date: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    // Reposer une date invalide la confirmation precedente (statut + traces remis a zero).
    await supabase.from(TABLE).upsert(
      {
        copro_code: coproCode,
        type,
        date_evenement: date,
        statut: "a_confirmer",
        confirme_le: null,
        confirme_par: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "copro_code,type" },
    );
  }
}
