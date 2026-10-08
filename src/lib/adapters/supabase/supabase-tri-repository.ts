// Adapter Supabase du tri des e-mails (ADR-046) : tables intranet_tri_binome,
// intranet_tri_dossier, intranet_tri_journal (supabase/sql/intranet_tri_emails.sql).
// Tables absentes (SQL pas encore passe) : lectures vides, ecritures en erreur claire.

import type { Binome, BinomesTri, DossierConnu, EntreeJournalTri, NatureSuggestion } from "@/lib/domain/tri-emails";
import type { NouvelleEntreeJournal, TriRepository } from "@/lib/ports/tri-repository";
import { createSupabasePublicClient } from "./public-client";

const SQL = "supabase/sql/intranet_tri_emails.sql puis intranet_tri_binomes_par_copro.sql";

type RowBinome = { id: string; gestionnaire_email: string; assistant_email: string; assistant_nom: string; principal: boolean };

type RowJournal = {
  id: string;
  boite: string;
  internet_message_id: string;
  message_id: string;
  expediteur: string;
  objet: string;
  copro_reference: string | null;
  copros: string[] | null;
  dossier_nom: string;
  dossier_cle: string | null;
  signal: string | null;
  candidats: string[] | null;
  simulation: boolean;
  par: string;
  fait_le: string;
  annule_le: string | null;
};

const COLS =
  "id, boite, internet_message_id, message_id, expediteur, objet, copro_reference, copros, dossier_nom, dossier_cle, signal, candidats, simulation, par, fait_le, annule_le";

function tableAbsente(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function erreur(quoi: string, error: { code?: string; message: string }): Error {
  return new Error(tableAbsente(error) ? `Tri des e-mails : tables absentes, passer ${SQL}.` : `Tri des e-mails (${quoi}) : ${error.message}`);
}

function versDomaine(r: RowJournal): EntreeJournalTri {
  return {
    id: r.id,
    boite: r.boite,
    internetMessageId: r.internet_message_id,
    messageId: r.message_id,
    expediteur: r.expediteur,
    objet: r.objet,
    coproReference: r.copro_reference,
    copros: r.copros ?? (r.copro_reference ? [r.copro_reference] : []),
    dossierNom: r.dossier_nom,
    dossierCle: r.dossier_cle ?? null,
    signal: (r.signal as NatureSuggestion | null) ?? null,
    candidats: r.candidats ?? [],
    simulation: r.simulation,
    par: r.par,
    faitLe: r.fait_le,
    annuleLe: r.annule_le,
  };
}

export class SupabaseTriRepository implements TriRepository {
  async binomes(): Promise<BinomesTri> {
    const client = createSupabasePublicClient();
    const [bin, aff] = await Promise.all([
      client.from("intranet_tri_binome").select("id, gestionnaire_email, assistant_email, assistant_nom, principal"),
      client.from("intranet_tri_binome_copro").select("copro_reference, binome_id"),
    ]);
    if (bin.error) {
      if (tableAbsente(bin.error)) return { binomes: [], parCopro: {} };
      throw erreur("binômes", bin.error);
    }
    if (aff.error && !tableAbsente(aff.error)) throw erreur("binômes", aff.error);
    const binomes: Binome[] = ((bin.data ?? []) as RowBinome[]).map((r) => ({
      id: r.id,
      gestionnaireEmail: r.gestionnaire_email.toLowerCase(),
      assistant: { nomComplet: r.assistant_nom, email: r.assistant_email.toLowerCase() },
      principal: r.principal,
    }));
    const parCopro: Record<string, string> = {};
    for (const r of (aff.data ?? []) as { copro_reference: string; binome_id: string }[]) parCopro[r.copro_reference] = r.binome_id;
    return { binomes, parCopro };
  }

  async enregistrerBinome(b: Omit<Binome, "id"> & { id?: string }, par: string): Promise<string> {
    const ligne = {
      gestionnaire_email: b.gestionnaireEmail.trim().toLowerCase(),
      assistant_email: b.assistant.email.trim().toLowerCase(),
      assistant_nom: b.assistant.nomComplet,
      principal: b.principal,
      maj_le: new Date().toISOString(),
      maj_par: par,
    };
    const client = createSupabasePublicClient();
    const { data, error } = b.id
      ? await client.from("intranet_tri_binome").update(ligne).eq("id", b.id).select("id").single()
      : await client.from("intranet_tri_binome").insert(ligne).select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("Ce collaborateur est déjà assistant de ce gestionnaire.");
      throw erreur("binôme", error);
    }
    return (data as { id: string }).id;
  }

  async supprimerBinome(id: string) {
    const { error } = await createSupabasePublicClient().from("intranet_tri_binome").delete().eq("id", id);
    if (error) throw erreur("binôme", error);
  }

  async affecterCopro(reference: string, binomeId: string | null, par: string) {
    const t = createSupabasePublicClient().from("intranet_tri_binome_copro");
    const { error } = binomeId
      ? await t.upsert({ copro_reference: reference, binome_id: binomeId, maj_le: new Date().toISOString(), maj_par: par })
      : await t.delete().eq("copro_reference", reference);
    if (error) throw erreur("affectation", error);
  }

  async dossier(boite: string, cle: string) {
    const { data, error } = await createSupabasePublicClient()
      .from("intranet_tri_dossier")
      .select("folder_id, nom")
      .eq("boite", boite)
      .eq("cle", cle)
      .maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null;
      throw erreur("dossier", error);
    }
    const r = data as { folder_id: string; nom: string } | null;
    return r ? { folderId: r.folder_id, nom: r.nom } : null;
  }

  async enregistrerDossier(boite: string, cle: string, d: { folderId: string; nom: string }) {
    const { error } = await createSupabasePublicClient()
      .from("intranet_tri_dossier")
      .upsert({ boite, cle, folder_id: d.folderId, nom: d.nom, maj_le: new Date().toISOString() });
    if (error) throw erreur("dossier", error);
  }

  async dossiers(boite: string): Promise<DossierConnu[]> {
    const { data, error } = await createSupabasePublicClient().from("intranet_tri_dossier").select("cle, folder_id, nom").eq("boite", boite);
    if (error) {
      if (tableAbsente(error)) return [];
      throw erreur("dossiers", error);
    }
    return ((data ?? []) as { cle: string; folder_id: string; nom: string }[]).map((r) => ({ cle: r.cle, folderId: r.folder_id, nom: r.nom }));
  }

  async majCopro(id: string, reference: string) {
    const { error } = await createSupabasePublicClient().from("intranet_tri_journal").update({ copro_reference: reference, copros: [reference] }).eq("id", id);
    if (error) throw erreur("journal", error);
  }

  async journaliser(e: NouvelleEntreeJournal): Promise<string> {
    const { data, error } = await createSupabasePublicClient()
      .from("intranet_tri_journal")
      .insert({
        boite: e.boite,
        internet_message_id: e.internetMessageId,
        message_id: e.messageId,
        expediteur: e.expediteur,
        objet: e.objet,
        copro_reference: e.coproReference,
        copros: e.copros,
        dossier_nom: e.dossierNom,
        dossier_cle: e.dossierCle,
        signal: e.signal,
        candidats: e.candidats,
        simulation: e.simulation,
        par: e.par,
      })
      .select("id")
      .single();
    if (error) throw erreur("journal", error);
    return (data as { id: string }).id;
  }

  async entree(id: string) {
    const { data, error } = await createSupabasePublicClient().from("intranet_tri_journal").select(COLS).eq("id", id).maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null;
      throw erreur("journal", error);
    }
    return data ? versDomaine(data as RowJournal) : null;
  }

  async journalDepuis(boite: string, depuisISO: string) {
    const { data, error } = await createSupabasePublicClient()
      .from("intranet_tri_journal")
      .select(COLS)
      .eq("boite", boite)
      .is("annule_le", null)
      .gte("fait_le", depuisISO)
      .order("fait_le", { ascending: false })
      .limit(500);
    if (error) {
      if (tableAbsente(error)) return [];
      throw erreur("journal", error);
    }
    return ((data ?? []) as RowJournal[]).map(versDomaine);
  }

  async dejaRanges(boite: string, ids: string[]) {
    if (ids.length === 0) return new Set<string>();
    const { data, error } = await createSupabasePublicClient()
      .from("intranet_tri_journal")
      .select("internet_message_id")
      .eq("boite", boite)
      .is("annule_le", null)
      .in("internet_message_id", ids);
    if (error) {
      if (tableAbsente(error)) return new Set<string>();
      throw erreur("journal", error);
    }
    return new Set(((data ?? []) as { internet_message_id: string }[]).map((r) => r.internet_message_id));
  }

  async marquerAnnule(id: string, par: string) {
    const { error } = await createSupabasePublicClient()
      .from("intranet_tri_journal")
      .update({ annule_le: new Date().toISOString(), annule_par: par })
      .eq("id", id);
    if (error) throw erreur("annulation", error);
  }
}
