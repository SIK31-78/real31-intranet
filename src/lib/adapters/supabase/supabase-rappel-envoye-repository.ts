// Adapter Supabase de la trace des rappels automatiques envoyes : table native
// public.intranet_rappels_envoyes (service_role, cle primaire = cle du rappel).
//
// RESERVER = INSERT de la cle. La cle primaire fait le travail d'idempotence : un second
// INSERT de la meme cle echoue en 23505 (doublon) -> « deja envoye ». Deux crons
// concurrents ne peuvent donc pas envoyer le meme rappel.
//
// Table ABSENTE (SQL pas encore passe) : on LEVE. Contrairement aux lectures qui degradent
// en silence ailleurs, ici l'absence de trace ferait renvoyer le meme rappel chaque jour de
// la fenetre : le cron n'envoie rien et le dit, tant que supabase/sql/intranet_rappels_envoyes.sql
// n'est pas execute.

import type { RappelEnvoyeRepository } from "@/lib/ports/rappel-envoye-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_rappels_envoyes";

function tableAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export class SupabaseRappelEnvoyeRepository implements RappelEnvoyeRepository {
  async reserver(cle: string): Promise<boolean> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).insert({ cle });
    if (!error) return true;
    if (error.code === "23505") return false; // deja reservee : rappel deja envoye
    if (tableAbsente(error)) {
      throw new Error(`Trace des rappels absente : passe supabase/sql/${TABLE}.sql dans le SQL editor Supabase.`);
    }
    throw new Error(`Reservation ${TABLE} : ${error.message}`);
  }

  async liberer(cle: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).delete().eq("cle", cle);
    if (error) throw new Error(`Liberation ${TABLE} : ${error.message}`);
  }
}
