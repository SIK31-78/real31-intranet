// Adapter Supabase de l'etat des jalons : lit/ecrit public.intranet_jalons
// (base patron) via service_role. Fusionne avec les cibles calculees (jalons-ag).

import type { EtatJalon, JalonRepository, MarquageJalon } from "@/lib/ports/jalon-repository";
import type { JalonAvecEtat, JalonCode, StatutJalon } from "@/lib/domain/jalons-ag/types";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";
import { createSupabasePublicClient } from "./public-client";

type EtatRow = {
  type: string;
  statut: string;
  realise_date: string | null;
  marque_par: string | null;
};

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

export class SupabaseJalonRepository implements JalonRepository {
  async getJalons(coproCode: string, agDateISO: string): Promise<JalonAvecEtat[]> {
    const cibles = calculerJalons(agDateISO);
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("intranet_jalons")
      .select("type, statut, realise_date, marque_par")
      .eq("copropriete_id", coproCode)
      .eq("ag_date", agDateISO);

    const etats = new Map((data as EtatRow[] | null)?.map((r) => [r.type, r]) ?? []);
    return cibles.map((j) => {
      const e = etats.get(j.code);
      return {
        ...j,
        statut: (e?.statut as StatutJalon) ?? "a_faire",
        ...(e?.realise_date ? { realiseDate: e.realise_date } : {}),
        ...(e?.marque_par ? { marquePar: e.marque_par } : {}),
      };
    });
  }

  async marquer({ coproCode, agDate, type, statut, par }: MarquageJalon): Promise<void> {
    const cible = calculerJalons(agDate).find((j) => j.code === type)?.cibleDate ?? agDate;
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_jalons").upsert(
      {
        copropriete_id: coproCode,
        ag_date: agDate,
        type,
        cible_date: cible,
        statut,
        realise_date: statut === "accompli" ? aujourdhui() : null,
        marque_par: par ?? null,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,type" },
    );
    if (error) throw new Error(`Marquage jalon : ${error.message}`);
  }

  async getEtats(coproCodes: string[]): Promise<EtatJalon[]> {
    if (coproCodes.length === 0) return [];
    // Borne temporelle : jalons dont l'AG est dans la fenetre -12 mois / aujourd'hui.
    const borneMin = new Date();
    borneMin.setMonth(borneMin.getMonth() - 12);
    const borneMinISO = borneMin.toISOString().slice(0, 10);
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("intranet_jalons")
      .select("copropriete_id, ag_date, type, statut, marque_par, marque_at")
      .in("copropriete_id", coproCodes)
      .gte("ag_date", borneMinISO);
    type Row = {
      copropriete_id: string;
      ag_date: string;
      type: string;
      statut: string;
      marque_par: string | null;
      marque_at: string | null;
    };
    return ((data as Row[] | null) ?? []).map((r) => ({
      coproCode: r.copropriete_id,
      agDate: r.ag_date,
      type: r.type as JalonCode,
      statut: r.statut as StatutJalon,
      ...(r.marque_par ? { marquePar: r.marque_par } : {}),
      ...(r.marque_at ? { marqueAt: r.marque_at } : {}),
    }));
  }
}
