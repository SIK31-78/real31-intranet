// Adapter Supabase des cles API machine (table native intranet_api_keys, service_role).
// Table absente (SQL pas encore passe) -> ApiNonConfigureeError : la couche HTTP
// repond 503 {ok:false, code:"api_non_configuree"} proprement, jamais un crash.

import type { CleApi } from "@/lib/domain/cle-api";
import { ApiNonConfigureeError } from "@/lib/domain/cle-api";
import type {
  CleApiSecrete,
  ClesApiRepository,
  CreationCleApi,
} from "@/lib/ports/cles-api-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_api_keys";
const COLS =
  "id, nom, cle_hash, prefixe, scopes, manager_id, cree_par, created_at, expires_at, revoked_at, last_used_at, usage_jour, usage_jour_date";

type Row = {
  id: string;
  nom: string;
  cle_hash: string;
  prefixe: string;
  scopes: string[] | null;
  manager_id: string | null;
  cree_par: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  usage_jour: number | null;
  usage_jour_date: string | null;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

function map(r: Row): CleApiSecrete {
  return {
    id: r.id,
    nom: r.nom,
    cleHash: r.cle_hash,
    prefixe: r.prefixe,
    scopes: r.scopes ?? [],
    createdAt: r.created_at,
    usageJour: r.usage_jour ?? 0,
    ...(r.manager_id ? { managerId: r.manager_id } : {}),
    ...(r.cree_par ? { creePar: r.cree_par } : {}),
    ...(r.expires_at ? { expiresAt: r.expires_at } : {}),
    ...(r.revoked_at ? { revokedAt: r.revoked_at } : {}),
    ...(r.last_used_at ? { lastUsedAt: r.last_used_at } : {}),
    ...(r.usage_jour_date ? { usageJourDate: r.usage_jour_date } : {}),
  };
}

function sansHash(c: CleApiSecrete): CleApi {
  const copie: CleApi & { cleHash?: string } = { ...c };
  delete copie.cleHash;
  return copie;
}

export class SupabaseClesApiRepository implements ClesApiRepository {
  async creer(input: CreationCleApi): Promise<CleApi> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        nom: input.nom,
        cle_hash: input.cleHash,
        prefixe: input.prefixe,
        scopes: input.scopes,
        manager_id: input.managerId ?? null,
        cree_par: input.creePar ?? null,
        expires_at: input.expiresAt ?? null,
      })
      .select(COLS)
      .single();
    if (error) {
      if (tableAbsente(error)) throw new ApiNonConfigureeError();
      throw new Error(`creer cle API : ${error.message}`);
    }
    return sansHash(map(data as Row));
  }

  async lister(): Promise<CleApi[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select(COLS)
      .order("created_at", { ascending: false });
    if (error) {
      if (tableAbsente(error)) throw new ApiNonConfigureeError();
      throw new Error(`lister cles API : ${error.message}`);
    }
    return (data as Row[]).map((r) => sansHash(map(r)));
  }

  async revoquer(id: string, nowISO: string): Promise<void> {
    const sb = createSupabasePublicClient();
    // .is("revoked_at", null) : une cle deja revoquee garde son horodatage d'origine.
    const { error } = await sb
      .from(TABLE)
      .update({ revoked_at: nowISO })
      .eq("id", id)
      .is("revoked_at", null);
    if (error) {
      if (tableAbsente(error)) throw new ApiNonConfigureeError();
      throw new Error(`revoquer cle API : ${error.message}`);
    }
  }

  async findByHash(hash: string): Promise<CleApiSecrete | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).eq("cle_hash", hash).maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new ApiNonConfigureeError();
      throw new Error(`resoudre cle API : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  async enregistrerUsage(
    id: string,
    lastUsedAtISO: string,
    usageJour: number,
    usageJourDateISO: string,
  ): Promise<void> {
    const sb = createSupabasePublicClient();
    // Best-effort assume : deux requetes simultanees peuvent perdre 1 increment
    // (compteur de VISIBILITE, pas un rate limit -> pas de RPC atomique pour ca).
    const { error } = await sb
      .from(TABLE)
      .update({
        last_used_at: lastUsedAtISO,
        usage_jour: usageJour,
        usage_jour_date: usageJourDateISO,
      })
      .eq("id", id);
    if (error && !tableAbsente(error)) {
      // L'usage ne doit jamais faire echouer la requete metier : on trace, c'est tout.
      console.warn(`[cles-api] enregistrerUsage KO : ${error.message}`);
    }
  }
}
