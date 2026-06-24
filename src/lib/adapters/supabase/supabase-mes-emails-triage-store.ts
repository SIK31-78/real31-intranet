// Adapter Supabase du cache de triage : public.intranet_mes_emails_triage, une
// ligne par gestionnaire (mails + dossiers en jsonb). Service_role ; degrade
// proprement si la table n'existe pas encore.

import type { Dossier, MailEntrant } from "@/lib/domain/mes-emails";
import type { MesEmailsTriageStore, TriagePersiste } from "@/lib/ports/mes-emails-triage-store";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_mes_emails_triage";

type Row = {
  mails: MailEntrant[] | null;
  dossiers: Dossier[] | null;
  nb_mails_analyses: number | null;
  sync_at: string | null;
};

const VIDE: TriagePersiste = { mails: [], dossiers: [], nbMailsAnalyses: 0, syncAt: null };

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

export class SupabaseMesEmailsTriageStore implements MesEmailsTriageStore {
  async lire(gestionnaireId: string): Promise<TriagePersiste> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("mails, dossiers, nb_mails_analyses, sync_at")
      .eq("gestionnaire_id", gestionnaireId)
      .maybeSingle();
    if (error) {
      if (tableAbsente(error)) return VIDE;
      throw new Error(`lire triage mes-emails : ${error.message}`);
    }
    if (!data) return VIDE;
    const r = data as Row;
    return {
      mails: r.mails ?? [],
      dossiers: r.dossiers ?? [],
      nbMailsAnalyses: r.nb_mails_analyses ?? 0,
      syncAt: r.sync_at ?? null,
    };
  }

  async remplacer(
    gestionnaireId: string,
    triage: { mails: MailEntrant[]; dossiers: Dossier[]; nbMailsAnalyses: number },
  ): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).upsert(
      {
        gestionnaire_id: gestionnaireId,
        mails: triage.mails,
        dossiers: triage.dossiers,
        nb_mails_analyses: triage.nbMailsAnalyses,
        sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gestionnaire_id" },
    );
    if (error && !tableAbsente(error)) {
      throw new Error(`remplacer triage mes-emails : ${error.message}`);
    }
  }
}
