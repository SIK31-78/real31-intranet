// Adapter Supabase du recap AG : lit/ecrit public.intranet_recap_ag et
// public.intranet_recap_ag_travaux (base patron) via le client public.

import type {
  NouveauRecapAg,
  RecapAgHistorique,
  RecapAgRepository,
  StatutRecapAg,
} from "@/lib/ports/recap-ag-repository";
import { createSupabasePublicClient } from "./public-client";

export class SupabaseRecapAgRepository implements RecapAgRepository {
  async existeRecap(coproCode: string, agDate: string): Promise<boolean> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_recap_ag")
      .select("id")
      .eq("copropriete_id", coproCode)
      .eq("ag_date", agDate)
      .maybeSingle();
    if (error) throw new Error(`Lecture recap AG ${coproCode} ${agDate} : ${error.message}`);
    return Boolean(data);
  }

  /**
   * Cree le recap puis ses travaux.
   *
   * Meme limite que la facturation : PostgREST ne fait pas de transaction
   * multi-tables. Si l'insertion des travaux echoue, le recap reste sans
   * travaux et l'erreur remonte, plutot qu'un recap silencieusement incomplet.
   */
  async creerRecapAg(input: NouveauRecapAg): Promise<string> {
    const supabase = createSupabasePublicClient();

    const { data, error } = await supabase
      .from("intranet_recap_ag")
      .insert({
        copropriete_id: input.coproCode,
        ag_date: input.agDate,
        debut_ag: input.debutAg,
        fin_ag: input.finAg,
        comptes_approuves: input.comptesApprouves ?? null,
        reserves: input.reserves ?? null,
        budget_modifie: input.budgetModifie ?? null,
        montant_budget: input.montantBudget ?? null,
        pourcentage_budget: input.pourcentageBudget ?? null,
        ppt_vote: input.pptVote ?? null,
        pourcentage_ppt: input.pourcentagePpt ?? null,
        montant_ppt: input.montantPpt ?? null,
        fonds_travaux: input.fondsTravaux ?? null,
        travaux_votes: input.travaux.length > 0,
        info_comptable: input.infoComptable ?? null,
        depassement_heures: input.depassementHeures,
        depassement_ttc: input.depassementTtc,
        suivi_contrat_id: input.suiviContratId ?? null,
        statut: input.statut,
        cree_par: input.par ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Creation recap AG : ${error?.message ?? "aucun id renvoye"}`);
    }
    const recapId = (data as { id: string }).id;

    if (input.travaux.length > 0) {
      const { error: erreurTravaux } = await supabase.from("intranet_recap_ag_travaux").insert(
        input.travaux.map((t, i) => ({
          recap_ag_id: recapId,
          ordre: i + 1,
          numero_resolution: t.numeroResolution ?? null,
          libelle: t.libelle,
          budget: t.budget ?? null,
          cle_repartition: t.cleRepartition ?? null,
          modalites_appel_fonds: t.modalitesAppelFonds ?? null,
        })),
      );
      if (erreurTravaux) {
        throw new Error(`Creation travaux du recap ${recapId} : ${erreurTravaux.message}`);
      }
    }

    return recapId;
  }

  async rattacherFacture(
    recapId: string,
    factureId: string,
    statut: StatutRecapAg,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_recap_ag")
      .update({ facture_id: factureId, statut, updated_at: new Date().toISOString() })
      .eq("id", recapId);
    if (error) throw new Error(`Rattachement facture au recap ${recapId} : ${error.message}`);
  }

  async listerRecapsRecents(limite = 50): Promise<RecapAgHistorique[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_recap_ag")
      .select(
        "id, copropriete_id, ag_date, statut, depassement_heures, depassement_ttc, " +
          "facture_id, cree_par, created_at, intranet_recap_ag_travaux (id)",
      )
      .order("created_at", { ascending: false })
      .limit(limite);

    if (error) throw new Error(`Lecture historique recap AG : ${error.message}`);

    type Row = {
      id: string;
      copropriete_id: string;
      ag_date: string;
      statut: string;
      depassement_heures: number | null;
      depassement_ttc: number | null;
      facture_id: string | null;
      cree_par: string | null;
      created_at: string;
      intranet_recap_ag_travaux: Array<{ id: string }> | null;
    };

    return ((data as unknown as Row[] | null) ?? []).map((r) => ({
      id: r.id,
      coproCode: r.copropriete_id,
      agDate: r.ag_date,
      statut: r.statut as StatutRecapAg,
      depassementHeures: Number(r.depassement_heures ?? 0),
      depassementTtc: Number(r.depassement_ttc ?? 0),
      nbTravaux: (r.intranet_recap_ag_travaux ?? []).length,
      ...(r.facture_id ? { factureId: r.facture_id } : {}),
      ...(r.cree_par ? { par: r.cree_par } : {}),
      creeLe: r.created_at,
    }));
  }
}
