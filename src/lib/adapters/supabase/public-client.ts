import { createClient } from "@supabase/supabase-js";

// Client Supabase service_role sur le schema `public`.
//
// La base cible (mutualisee avec l'App A) heberge le referentiel dans le schema
// `public` au format Prisma (Copropriete, User...). Nos autres clients sont
// epingles sur `real31_intranet` ; celui-ci vise `public` pour LIRE le referentiel.
//
// Lecture seule cote intranet (ADR-002 : on ne reecrit jamais la source).
//
// ATTENTION : service_role bypasse la RLS. Le cloisonnement gestionnaire
// (ADR-009/011) n'est donc PAS applique ici. A reconstruire (vues RLS / filtrage
// au branchement de l'auth Entra ID) avant tout usage multi-utilisateurs reel.
export function createSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase public client : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans l'env.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
}
