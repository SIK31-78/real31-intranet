import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Client Supabase service_role : bypass total de la RLS.
// A n'utiliser QUE cote serveur trusted : jobs cron, scripts admin, health
// check. JAMAIS dans un Server Component qui rend du contenu user-facing
// sans filtrage explicite cote code.
//
// SUPABASE_SERVICE_ROLE_KEY : pas de prefixe NEXT_PUBLIC_ -> non expose
// au browser. Verification lazy (au call) car les vars d'env ne sont pas
// disponibles en build statique.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans l'env.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "real31_intranet" },
  });
}
