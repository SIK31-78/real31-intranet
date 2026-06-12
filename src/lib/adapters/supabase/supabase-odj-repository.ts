// Adapter Supabase de l'etat ODJ : lit/ecrit public.intranet_odj_champs
// (base patron, service_role). Suit le meme schema d'etat que la supervision.

import type { EtatChampOdj, OdjRepository } from "@/lib/ports/odj-repository";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";
import { createSupabasePublicClient } from "./public-client";

type Row = { champ_id: string; valeur: string | null };

export class SupabaseOdjRepository implements OdjRepository {
  async getEtat(coproCode: string, agDateISO: string): Promise<EtatChampOdj[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_odj_champs")
      .select("champ_id, valeur")
      .eq("copropriete_id", coproCode)
      .eq("ag_date", agDateISO);
    if (error) throw new Error(`Lecture intranet_odj_champs : ${error.message}`);
    return ((data as Row[] | null) ?? []).map((r) => ({ champId: r.champ_id, valeur: r.valeur }));
  }

  async setChamp(
    coproCode: string,
    agDateISO: string,
    champId: string,
    valeur: string | null,
    par: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    if (valeur === null || valeur === "") {
      // Effacer la saisie = retour a la valeur auto.
      const { error } = await supabase
        .from("intranet_odj_champs")
        .delete()
        .eq("copropriete_id", coproCode)
        .eq("ag_date", agDateISO)
        .eq("champ_id", champId);
      if (error) throw new Error(`Effacement champ ODJ : ${error.message}`);
      return;
    }
    const { error } = await supabase.from("intranet_odj_champs").upsert(
      {
        copropriete_id: coproCode,
        ag_date: agDateISO,
        champ_id: champId,
        valeur,
        marque_par: par,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,champ_id" },
    );
    if (error) throw new Error(`Saisie champ ODJ : ${error.message}`);
  }

  async reporterSansDate(coproCode: string, nouvelleDateISO: string): Promise<void> {
    if (nouvelleDateISO === ODJ_SANS_DATE) return;
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("intranet_odj_champs")
      .select("champ_id, valeur, marque_par, marque_at")
      .eq("copropriete_id", coproCode)
      .eq("ag_date", ODJ_SANS_DATE);
    const rows = (data as (Row & { marque_par: string | null; marque_at: string | null })[] | null) ?? [];
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      copropriete_id: coproCode,
      ag_date: nouvelleDateISO,
      champ_id: r.champ_id,
      valeur: r.valeur,
      marque_par: r.marque_par,
      marque_at: r.marque_at,
    }));
    const up = await supabase
      .from("intranet_odj_champs")
      .upsert(payload, { onConflict: "copropriete_id,ag_date,champ_id" });
    if (up.error) throw new Error(`Report ODJ sans date : ${up.error.message}`);
    await supabase
      .from("intranet_odj_champs")
      .delete()
      .eq("copropriete_id", coproCode)
      .eq("ag_date", ODJ_SANS_DATE);
  }
}
