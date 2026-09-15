// Adapter Supabase du dossier de perte (table native intranet_perte_dossier).

import type { PerteRepository } from "@/lib/ports/perte-repository";
import type { DossierPerte, EntreeJournalPerte, EtapePerte } from "@/lib/domain/perte/dossier";
import { createSupabasePublicClient } from "./public-client";

type Row = {
  id: string;
  copropriete_id: string;
  copro_nom: string;
  date_ag: string;
  fin_gestion: string;
  motif: string | null;
  statut: "en_cours" | "termine";
  etapes: EtapePerte[];
  journal: EntreeJournalPerte[];
  cree_par: string;
  created_at: string;
};

const COLS =
  "id, copropriete_id, copro_nom, date_ag, fin_gestion, motif, statut, etapes, journal, cree_par, created_at";

function versDomaine(r: Row): DossierPerte {
  return {
    id: r.id,
    coproCode: r.copropriete_id,
    coproNom: r.copro_nom,
    dateAgISO: r.date_ag.slice(0, 10),
    finGestionISO: r.fin_gestion.slice(0, 10),
    ...(r.motif ? { motif: r.motif } : {}),
    statut: r.statut,
    etapes: Array.isArray(r.etapes) ? r.etapes : [],
    journal: Array.isArray(r.journal) ? r.journal : [],
    creeParNom: r.cree_par,
    creeLeISO: r.created_at.slice(0, 10),
  };
}

export class SupabasePerteRepository implements PerteRepository {
  async lister(): Promise<DossierPerte[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_perte_dossier")
      .select(COLS)
      .order("date_ag", { ascending: false });
    // Table absente (SQL pas encore passe) : la liste est vide, la page le dit.
    if (error) {
      console.warn(`[perte-dossier] lecture impossible : ${error.message}`);
      return [];
    }
    return ((data ?? []) as unknown as Row[]).map(versDomaine);
  }

  async get(id: string): Promise<DossierPerte | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_perte_dossier")
      .select(COLS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Dossier de perte ${id} : ${error.message}`);
    return data ? versDomaine(data as unknown as Row) : null;
  }

  async getEnCoursPourCopro(coproCode: string): Promise<DossierPerte | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_perte_dossier")
      .select(COLS)
      .eq("copropriete_id", coproCode)
      .eq("statut", "en_cours")
      .order("date_ag", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`[perte-dossier] lecture impossible (${coproCode}) : ${error.message}`);
      return null;
    }
    return data ? versDomaine(data as unknown as Row) : null;
  }

  async creer(d: Omit<DossierPerte, "id">): Promise<DossierPerte> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_perte_dossier")
      .insert({
        copropriete_id: d.coproCode,
        copro_nom: d.coproNom,
        date_ag: d.dateAgISO,
        fin_gestion: d.finGestionISO,
        motif: d.motif ?? null,
        statut: d.statut,
        etapes: d.etapes,
        journal: d.journal,
        cree_par: d.creeParNom,
      })
      .select(COLS)
      .single();
    if (error || !data) {
      const message = error?.message ?? "aucune ligne";
      throw new Error(
        /duplicate|unique/i.test(message)
          ? `Un dossier de perte existe déjà pour ${d.coproCode} et l'AG du ${d.dateAgISO}.`
          : `Dossier de perte ${d.coproCode} : ${message}`,
      );
    }
    return versDomaine(data as unknown as Row);
  }

  async sauver(d: DossierPerte): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_perte_dossier")
      .update({
        etapes: d.etapes,
        journal: d.journal,
        statut: d.statut,
        updated_at: new Date().toISOString(),
      })
      .eq("id", d.id);
    if (error) throw new Error(`Dossier de perte ${d.id} : ${error.message}`);
  }
}
