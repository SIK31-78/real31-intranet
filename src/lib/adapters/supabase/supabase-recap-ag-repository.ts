// Adapter Supabase du recap AG : lit/ecrit public.intranet_recap_ag et
// public.intranet_recap_ag_travaux (base patron) via le client public.
//
// COLONNES DE TRAITEMENT (traite_compta_at / traite_compta_par) : ajoutees apres coup par
// supabase/sql/intranet_recap_ag_traitement.sql, que Sekou passe a la main. Tant qu'il
// n'est pas passe, elles sont ABSENTES de la base -> PostgREST refuse la requete entiere
// (42703). On degrade donc en LECTURE (on relit sans ces colonnes : "traite" reste faux,
// la file marche) et on LEVE en ECRITURE (message nommant le SQL) : degrader en silence
// une ecriture demandee par l'utilisateur lui affiche un succes mensonger - piege deja
// paye sur intranet_copro_dates le 2026-07-28.

import type {
  NouveauRecapAg,
  RecapAgDetail,
  RecapAgFileLigne,
  RecapAgHistorique,
  RecapAgRepository,
  StatutRecapAg,
  TravauxVotes,
} from "@/lib/ports/recap-ag-repository";
import { createSupabasePublicClient } from "./public-client";

const SQL_TRAITEMENT = "supabase/sql/intranet_recap_ag_traitement.sql";

/** Colonne absente : l'ALTER n'a pas encore ete passe (42703 en lecture, PGRST204 en ecriture). */
function colonneAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the '.*' column/i.test(error.message ?? "")
  );
}

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

  // --- File comptable (le recap comme note de travail) -----------------------

  async getRecapAg(recapId: string): Promise<RecapAgDetail | null> {
    const lire = async (avecTraitement: boolean) =>
      createSupabasePublicClient()
        .from("intranet_recap_ag")
        .select(avecTraitement ? `${COLS_DETAIL}, ${COLS_TRAITEMENT}` : COLS_DETAIL)
        .eq("id", recapId)
        .maybeSingle();

    let { data, error } = await lire(true);
    // Colonnes de traitement pas encore posees : on relit sans elles plutot que de
    // priver le comptable de toute la note de travail pour un marqueur manquant.
    if (error && colonneAbsente(error)) ({ data, error } = await lire(false));
    if (error) throw new Error(`Lecture recap AG ${recapId} : ${error.message}`);
    if (!data) return null;

    return versDetail(data as unknown as LigneDetail);
  }

  async listerRecapsPourFile(limite = 100): Promise<RecapAgFileLigne[]> {
    const lire = async (avecTraitement: boolean) =>
      createSupabasePublicClient()
        .from("intranet_recap_ag")
        .select(avecTraitement ? `${COLS_FILE}, ${COLS_TRAITEMENT}` : COLS_FILE)
        .order("created_at", { ascending: false })
        .limit(limite);

    let { data, error } = await lire(true);
    if (error && colonneAbsente(error)) ({ data, error } = await lire(false));
    if (error) throw new Error(`Lecture de la file des recaps AG : ${error.message}`);

    return ((data as unknown as LigneFile[] | null) ?? []).map((r) => ({
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
      ...traitementDepuisLigne(r),
    }));
  }

  async listerDatesAgParCopro(coproCodes: readonly string[]): Promise<Map<string, string[]>> {
    const parCopro = new Map<string, string[]>();
    if (coproCodes.length === 0) return parCopro;

    const supabase = createSupabasePublicClient();
    // Decoupe en paquets : le filtre `in` part dans l'URL, et un perimetre cabinet fait
    // deja ~265 codes. On borne la longueur d'URL plutot que de la decouvrir en prod.
    for (let i = 0; i < coproCodes.length; i += TAILLE_PAQUET_CODES) {
      const paquet = coproCodes.slice(i, i + TAILLE_PAQUET_CODES);
      const { data, error } = await supabase
        .from("intranet_recap_ag")
        .select("copropriete_id, ag_date")
        .in("copropriete_id", paquet as string[]);
      if (error) throw new Error(`Lecture des dates de recap AG : ${error.message}`);

      for (const r of (data as unknown as LigneDateAg[] | null) ?? []) {
        const dates = parCopro.get(r.copropriete_id);
        // `ag_date` est une colonne date, mais PostgREST peut renvoyer un timestamp
        // complet selon le type retenu : on ne garde que le jour.
        const jour = r.ag_date.slice(0, 10);
        if (dates) dates.push(jour);
        else parCopro.set(r.copropriete_id, [jour]);
      }
    }
    return parCopro;
  }

  async marquerTraite(recapId: string, traite: boolean, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_recap_ag")
      .update({
        traite_compta_at: traite ? new Date().toISOString() : null,
        traite_compta_par: traite ? par : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recapId);

    if (error) {
      if (colonneAbsente(error)) {
        throw new Error(
          "Suivi des récaps non configuré : les colonnes traite_compta_at / traite_compta_par " +
            `n'existent pas encore. Passe ${SQL_TRAITEMENT} dans le SQL editor Supabase.`,
        );
      }
      throw new Error(`Marquage du recap ${recapId} : ${error.message}`);
    }
  }
}

// --- Mapping des lignes (snake_case -> domaine) ------------------------------

const COLS_TRAITEMENT = "traite_compta_at, traite_compta_par";

/** Nombre de codes copro envoyes par requete dans le filtre `in` (longueur d'URL). */
const TAILLE_PAQUET_CODES = 150;

type LigneDateAg = { copropriete_id: string; ag_date: string };

const COLS_FILE =
  "id, copropriete_id, ag_date, statut, depassement_heures, depassement_ttc, " +
  "facture_id, cree_par, created_at, intranet_recap_ag_travaux (id)";

const COLS_DETAIL =
  "id, copropriete_id, ag_date, debut_ag, fin_ag, comptes_approuves, reserves, " +
  "budget_modifie, montant_budget, pourcentage_budget, ppt_vote, pourcentage_ppt, " +
  "montant_ppt, fonds_travaux, info_comptable, depassement_heures, depassement_ttc, " +
  "suivi_contrat_id, facture_id, statut, cree_par, created_at, " +
  "intranet_recap_ag_travaux (ordre, numero_resolution, libelle, budget, cle_repartition, modalites_appel_fonds)";

/** Colonnes de traitement : absentes de la ligne tant que le SQL n'est pas passe. */
type LigneTraitement = {
  traite_compta_at?: string | null;
  traite_compta_par?: string | null;
};

type LigneFile = LigneTraitement & {
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

type LigneTravaux = {
  ordre: number | null;
  numero_resolution: string | null;
  libelle: string;
  budget: number | null;
  cle_repartition: string | null;
  modalites_appel_fonds: string | null;
};

type LigneDetail = LigneTraitement & {
  id: string;
  copropriete_id: string;
  ag_date: string;
  debut_ag: string;
  fin_ag: string;
  comptes_approuves: boolean | null;
  reserves: string | null;
  budget_modifie: boolean | null;
  montant_budget: number | null;
  pourcentage_budget: number | null;
  ppt_vote: boolean | null;
  pourcentage_ppt: number | null;
  montant_ppt: number | null;
  fonds_travaux: boolean | null;
  info_comptable: string | null;
  depassement_heures: number | null;
  depassement_ttc: number | null;
  suivi_contrat_id: string | null;
  facture_id: string | null;
  statut: string;
  cree_par: string | null;
  created_at: string;
  intranet_recap_ag_travaux: LigneTravaux[] | null;
};

function traitementDepuisLigne(r: LigneTraitement) {
  return {
    ...(r.traite_compta_at ? { traiteLe: r.traite_compta_at } : {}),
    ...(r.traite_compta_par ? { traitePar: r.traite_compta_par } : {}),
  };
}

/** Un numerique PostgREST peut arriver en string (numeric) ; absent = champ non saisi. */
function nombre(v: number | null): number | undefined {
  return v === null || v === undefined ? undefined : Number(v);
}

function versDetail(r: LigneDetail): RecapAgDetail {
  const travaux: TravauxVotes[] = [...(r.intranet_recap_ag_travaux ?? [])]
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map((t) => ({
      libelle: t.libelle,
      ...(t.numero_resolution ? { numeroResolution: t.numero_resolution } : {}),
      ...(t.budget !== null ? { budget: Number(t.budget) } : {}),
      ...(t.cle_repartition ? { cleRepartition: t.cle_repartition } : {}),
      ...(t.modalites_appel_fonds ? { modalitesAppelFonds: t.modalites_appel_fonds } : {}),
    }));

  return {
    id: r.id,
    coproCode: r.copropriete_id,
    agDate: r.ag_date,
    debutAg: r.debut_ag,
    finAg: r.fin_ag,
    ...(r.comptes_approuves !== null ? { comptesApprouves: r.comptes_approuves } : {}),
    ...(r.reserves ? { reserves: r.reserves } : {}),
    ...(r.budget_modifie !== null ? { budgetModifie: r.budget_modifie } : {}),
    ...(nombre(r.montant_budget) !== undefined ? { montantBudget: Number(r.montant_budget) } : {}),
    ...(nombre(r.pourcentage_budget) !== undefined
      ? { pourcentageBudget: Number(r.pourcentage_budget) }
      : {}),
    ...(r.ppt_vote !== null ? { pptVote: r.ppt_vote } : {}),
    ...(nombre(r.pourcentage_ppt) !== undefined
      ? { pourcentagePpt: Number(r.pourcentage_ppt) }
      : {}),
    ...(nombre(r.montant_ppt) !== undefined ? { montantPpt: Number(r.montant_ppt) } : {}),
    ...(r.fonds_travaux !== null ? { fondsTravaux: r.fonds_travaux } : {}),
    ...(r.info_comptable ? { infoComptable: r.info_comptable } : {}),
    depassementHeures: Number(r.depassement_heures ?? 0),
    depassementTtc: Number(r.depassement_ttc ?? 0),
    travaux,
    ...(r.suivi_contrat_id ? { suiviContratId: r.suivi_contrat_id } : {}),
    ...(r.facture_id ? { factureId: r.facture_id } : {}),
    statut: r.statut as StatutRecapAg,
    ...(r.cree_par ? { par: r.cree_par } : {}),
    creeLe: r.created_at,
    ...traitementDepuisLigne(r),
  };
}
