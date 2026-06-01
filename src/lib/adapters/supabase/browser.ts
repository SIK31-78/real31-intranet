"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Client Supabase cote browser : auth-context-aware (lit la session depuis
// les cookies poses par @supabase/ssr). Schema cible : real31_intranet.
// La RLS protege les acces, donc anon key OK cote browser.
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "real31_intranet" },
    },
  );
}
