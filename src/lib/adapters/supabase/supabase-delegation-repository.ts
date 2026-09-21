// Adapter Supabase des delegations d'ecriture (ADR-041) : table intranet_delegation. La
// table peut manquer (SQL pas encore passe) : lectures vides, jamais une erreur ; une
// ecriture, elle, echoue en clair.

import type { DelegationEnregistree, DelegationRepository, NouvelleDelegation } from "@/lib/ports/delegation-repository";
import type { PorteeDelegation } from "@/lib/domain/perimetre-ecriture";
import { createSupabasePublicClient } from "./public-client";

type Row = {
  id: string;
  de_user_id: string;
  a_user_id: string;
  portee: PorteeDelegation;
  agence: string | null;
  copro_code: string | null;
  depuis: string;
  jusqua: string | null;
  motif: string | null;
  cree_par: string;
  created_at: string;
  cloture_le: string | null;
};

const COLS = "id, de_user_id, a_user_id, portee, agence, copro_code, depuis, jusqua, motif, cree_par, created_at, cloture_le";

function toDomaine(r: Row): DelegationEnregistree {
  return {
    id: r.id,
    deUserId: r.de_user_id,
    aUserId: r.a_user_id,
    portee: r.portee,
    agenceCode: r.agence,
    coproCode: r.copro_code,
    depuisISO: r.depuis,
    jusquaISO: r.jusqua,
    motif: r.motif,
    creePar: r.cree_par,
    createdAtISO: r.created_at,
    clotureeLeISO: r.cloture_le,
  };
}

/** Table absente (42P01 / PGRST205) : aucune delegation. */
function tableAbsente(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export class SupabaseDelegationRepository implements DelegationRepository {
  async listerPourBeneficiaire(userId: string): Promise<DelegationEnregistree[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("intranet_delegation").select(COLS).eq("a_user_id", userId).is("cloture_le", null);
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`Délégations : ${error.message}`);
    }
    return ((data as Row[] | null) ?? []).map(toDomaine);
  }

  async listerEnCours(): Promise<DelegationEnregistree[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("intranet_delegation").select(COLS).is("cloture_le", null).order("depuis", { ascending: false });
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`Délégations : ${error.message}`);
    }
    return ((data as Row[] | null) ?? []).map(toDomaine);
  }

  async creer(d: NouvelleDelegation): Promise<string> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_delegation")
      .insert({
        de_user_id: d.deUserId,
        a_user_id: d.aUserId,
        portee: d.portee,
        agence: d.agenceCode ?? null,
        copro_code: d.coproCode ?? null,
        depuis: d.depuisISO,
        jusqua: d.jusquaISO ?? null,
        motif: d.motif ?? null,
        cree_par: d.creePar,
      })
      .select("id")
      .single();
    if (error) {
      if (tableAbsente(error)) throw new Error("La table des délégations n'existe pas encore : passer supabase/sql/intranet_delegation.sql.");
      throw new Error(`Délégation : ${error.message}`);
    }
    return (data as { id: string }).id;
  }

  async cloturer(id: string, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_delegation").update({ cloture_le: new Date().toISOString(), cloture_par: par }).eq("id", id).is("cloture_le", null);
    if (error) throw new Error(`Délégation : ${error.message}`);
  }
}
