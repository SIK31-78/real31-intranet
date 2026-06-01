import { createSupabaseAdminClient } from "./admin";

export type DbHealth =
  | { ok: true; rows: Array<{ key: string; description: string | null }> }
  | { ok: false; error: string };

// Verifie le branchement BDD en lisant les 5 seeds de cabinet_settings.
// Bypass la RLS via service_role (cabinet_settings n'a aucune policy user).
export async function checkDbHealth(): Promise<DbHealth> {
  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client
      .from("cabinet_settings")
      .select("key, description")
      .order("key");
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: data ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
