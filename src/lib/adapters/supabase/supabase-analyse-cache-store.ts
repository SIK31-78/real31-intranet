// Adapter Supabase du cache d'analyse : public.intranet_mes_emails_analyse, cle
// (gestionnaire_id, internet_message_id). Service_role ; degrade proprement si la
// table n'existe pas encore.

import type { TypeMail } from "@/lib/domain/mes-emails";
import type { AnalyseCachee, AnalyseCacheStore } from "@/lib/ports/analyse-cache-store";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_mes_emails_analyse";

type Row = {
  internet_message_id: string;
  type: string;
  ticketable: boolean | null;
  est_nouveau_ticket: boolean | null;
  confidence: number | null;
  rationale: string | null;
  brouillon: string | null;
  etapes: string[] | null;
  prompt_version: string;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

function versAnalyse(r: Row): AnalyseCachee {
  return {
    internetMessageId: r.internet_message_id,
    type: (r.type as TypeMail) || "autre",
    ticketable: r.ticketable ?? false,
    estNouveauTicket: r.est_nouveau_ticket ?? false,
    confidence: r.confidence ?? 0.5,
    rationale: r.rationale ?? "",
    brouillon: r.brouillon ?? "",
    etapes: r.etapes ?? [],
    promptVersion: r.prompt_version,
  };
}

export class SupabaseAnalyseCacheStore implements AnalyseCacheStore {
  async lirePar(gestionnaireId: string, internetMessageIds: string[]): Promise<Map<string, AnalyseCachee>> {
    const out = new Map<string, AnalyseCachee>();
    if (internetMessageIds.length === 0) return out;
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("internet_message_id, type, ticketable, est_nouveau_ticket, confidence, rationale, brouillon, etapes, prompt_version")
      .eq("gestionnaire_id", gestionnaireId)
      .in("internet_message_id", internetMessageIds);
    if (error) {
      if (tableAbsente(error)) return out;
      throw new Error(`lire analyse mes-emails : ${error.message}`);
    }
    for (const r of (data as Row[] | null) ?? []) out.set(r.internet_message_id, versAnalyse(r));
    return out;
  }

  async ecrire(gestionnaireId: string, analyse: AnalyseCachee): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).upsert(
      {
        gestionnaire_id: gestionnaireId,
        internet_message_id: analyse.internetMessageId,
        type: analyse.type,
        ticketable: analyse.ticketable,
        est_nouveau_ticket: analyse.estNouveauTicket,
        confidence: analyse.confidence,
        rationale: analyse.rationale,
        brouillon: analyse.brouillon,
        etapes: analyse.etapes,
        prompt_version: analyse.promptVersion,
        analysed_at: new Date().toISOString(),
      },
      { onConflict: "gestionnaire_id,internet_message_id" },
    );
    if (error && !tableAbsente(error)) {
      throw new Error(`ecrire analyse mes-emails : ${error.message}`);
    }
  }
}
