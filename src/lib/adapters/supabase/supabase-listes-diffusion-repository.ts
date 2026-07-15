// Adapter Supabase des listes de diffusion Crypto (intranet_listes_diffusion) : lookup
// de la liste "conseil syndical" d'une copro par sa reference normalisee, via service_role.
// Degrade proprement si la table n'existe pas encore (avant l'import) -> aucun destinataire.

import type { ListesDiffusionProvider, ListeCSCopro } from "@/lib/ports/listes-diffusion-provider";
import { normaliserRefCopro } from "@/lib/domain/listes-diffusion";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_listes_diffusion";

export class SupabaseListesDiffusionRepository implements ListesDiffusionProvider {
  async listeCSPourCopro(coproCode: string): Promise<ListeCSCopro | null> {
    const code = normaliserRefCopro(coproCode);
    if (!code) return null;
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("copro_code, designation, emails")
      .eq("copro_code", code)
      .eq("type_liste", "conseil_syndical")
      .limit(1);
    if (error || !data || data.length === 0) {
      // Table pas encore creee / importee, ou aucune liste CS pour cette copro.
      return null;
    }
    const row = data[0] as { copro_code: string; designation: string; emails: string[] | null };
    const emails = (row.emails ?? []).filter(Boolean);
    if (emails.length === 0) return null;
    return { coproCode: row.copro_code, designation: row.designation, emails };
  }
}
