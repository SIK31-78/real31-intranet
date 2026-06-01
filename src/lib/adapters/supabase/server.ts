import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

// Client Supabase cote serveur : Server Components, Server Actions et
// Route Handlers. Lit la session via les cookies Next. Schema cible :
// real31_intranet. La RLS s'applique au scope de l'user connecte.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "real31_intranet" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components purs ne peuvent pas ecrire de cookies :
            // ignore, le middleware se charge du refresh de session.
          }
        },
      },
    },
  );
}
