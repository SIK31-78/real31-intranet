// Adapter Supabase des dates AG/CS des copros eStale : table native public.intranet_copro_dates
// (service_role, une ligne par copro eStale). Ecrit UNE colonne par pose de date.
//
// Degradation propre (piege deja paye ailleurs, cf. supabase-agence-repository) :
//  - TABLE absente (42P01 / PGRST205 / "could not find the table") -> on degrade
//    (lecture null/[], ecriture ignoree) : tant que le SQL n'est pas execute, la
//    fonctionnalite est inerte, l'app tourne. Les copros eStale gardent le repli miroir.
//  - COLONNE absente (PGRST204) -> on THROW : c'est un schema a corriger, pas un etat attendu.

import type { CoproDatesRepository } from "@/lib/ports/copro-dates-repository";
import { datesDepuisTimestamps, type CoproDates } from "@/lib/domain/copro-fusion";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_copro_dates";
const COLS = "copro_code, next_ag_date, next_cs_date, last_ag_date, last_cs_date";

type Row = {
  copro_code: string;
  next_ag_date: string | null;
  next_cs_date: string | null;
  last_ag_date: string | null;
  last_cs_date: string | null;
};

const COLONNES = {
  ag: { prochaine: "next_ag_date", derniere: "last_ag_date" },
  cs: { prochaine: "next_cs_date", derniere: "last_cs_date" },
} as const;

function tableAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export class SupabaseCoproDatesRepository implements CoproDatesRepository {
  async lire(code: string): Promise<CoproDates | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).eq("copro_code", code).maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null; // table pas encore creee -> repli miroir en amont
      throw new Error(`Lecture ${TABLE} : ${error.message}`);
    }
    return data ? datesDepuisTimestamps(data as Row) : null;
  }

  async lireToutes(): Promise<Map<string, CoproDates>> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS);
    if (error) {
      if (tableAbsente(error)) return new Map(); // table absente -> aucune date intranet
      throw new Error(`Lecture ${TABLE} : ${error.message}`);
    }
    return new Map((data as Row[] | null ?? []).map((r) => [r.copro_code, datesDepuisTimestamps(r)]));
  }

  async ecrire(
    code: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
  ): Promise<void> {
    const sb = createSupabasePublicClient();
    const colonne = COLONNES[type][quand];
    const { error } = await sb
      .from(TABLE)
      .upsert(
        { copro_code: code, [colonne]: dateISO, updated_at: new Date().toISOString() },
        { onConflict: "copro_code" },
      );
    if (error) {
      // Table absente : on NE degrade PLUS en silence (bug Sekou 2026-07-28 : "j'efface la
      // date de CS et AG, ca ne se supprime pas"). C'est une ECRITURE DEMANDEE par
      // l'utilisateur : un no-op silencieux lui affiche un succes alors que rien n'est
      // enregistre, et la lecture replie sur le miroir -> l'ancienne date "revient".
      // On remonte donc une erreur EXPLICITE et actionnable (l'UI l'affiche en rouge).
      if (tableAbsente(error)) {
        throw new Error(
          `Dates des copropriétés eStale non configurées : la table ${TABLE} n'existe pas. ` +
            `Passe supabase/sql/${TABLE}.sql dans le SQL editor Supabase.`,
        );
      }
      // COLONNE absente (PGRST204) ou autre -> on remonte : schema a corriger.
      throw new Error(`MAJ ${TABLE} (${colonne}) : ${error.message}`);
    }
  }
}
