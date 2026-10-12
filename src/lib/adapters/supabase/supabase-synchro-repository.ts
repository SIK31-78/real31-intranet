// Adapter Supabase du compte rendu des synchros (supabase/sql/intranet_crypto_annuaire.sql).
// Table absente (SQL pas encore passe) : erreur, que la surveillance traduit en alerte.

import type { EtatSynchro } from "@/lib/domain/synchro";
import type { SynchroRepository } from "@/lib/ports/synchro-repository";
import { createSupabasePublicClient } from "./public-client";

type Row = {
  passe_le: string;
  reussi_le: string | null;
  export_du: string | null;
  statut: EtatSynchro["statut"];
  message: string | null;
  lignes: number | null;
};

export class SupabaseSynchroRepository implements SynchroRepository {
  async etat(cle: string): Promise<EtatSynchro | null> {
    const { data, error } = await createSupabasePublicClient()
      .from("intranet_synchro")
      .select("passe_le, reussi_le, export_du, statut, message, lignes")
      .eq("cle", cle)
      .maybeSingle<Row>();
    if (error) throw new Error(`intranet_synchro illisible (supabase/sql/intranet_crypto_annuaire.sql passé ?) : ${error.message}`);
    if (!data) return null;
    return {
      passeLe: data.passe_le,
      reussiLe: data.reussi_le,
      exportDu: data.export_du,
      statut: data.statut,
      message: data.message,
      lignes: data.lignes,
    };
  }
}
