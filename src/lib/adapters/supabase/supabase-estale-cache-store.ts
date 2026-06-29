// Adapter Supabase du cache eStale : table public.intranet_estale_cache (une ligne par
// copro, payload jsonb + cached_at). Service_role. Degrade proprement (cache "vide") si
// la table n'existe pas encore -> on retombe sur l'appel eStale live, jamais d'erreur.

import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { EstaleCacheStore } from "@/lib/ports/estale-cache-store";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_estale_cache";

export class SupabaseEstaleCacheStore implements EstaleCacheStore {
  async lire(coproCode: string, ttlSeconds: number): Promise<DonneesEstaleCopro | null> {
    const sb = createSupabasePublicClient();
    const seuil = new Date(Date.now() - ttlSeconds * 1000).toISOString();
    const { data, error } = await sb
      .from(TABLE)
      .select("payload")
      .eq("copro_code", coproCode)
      .gte("cached_at", seuil)
      .maybeSingle();
    if (error) return null; // table absente / erreur -> pas de cache (degrade)
    return (data?.payload as DonneesEstaleCopro | undefined) ?? null;
  }

  async ecrire(coproCode: string, donnees: DonneesEstaleCopro): Promise<void> {
    const sb = createSupabasePublicClient();
    await sb
      .from(TABLE)
      .upsert(
        { copro_code: coproCode, payload: donnees, cached_at: new Date().toISOString() },
        { onConflict: "copro_code" },
      );
    // Erreur ignoree volontairement : le cache est best-effort (ne casse jamais la lecture).
  }

  async invalider(coproCode: string): Promise<void> {
    const sb = createSupabasePublicClient();
    await sb.from(TABLE).delete().eq("copro_code", coproCode);
  }
}
