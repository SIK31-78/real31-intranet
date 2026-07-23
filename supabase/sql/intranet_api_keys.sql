-- Table native intranet : CLES API MACHINE (auth des routes /api/v1 + serveur MCP).
-- Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), comme les autres
-- tables natives intranet_* (jalons / supervision_items / dossiers / compta_notes...).
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
--
-- SECURITE :
--   - La cle EN CLAIR n'est JAMAIS stockee : seul son hash sha256 (hex) est en base
--     (cle_hash). Le clair est montre UNE seule fois a la creation, dans /admin/cles-api.
--   - prefixe = les 8 premiers caracteres de la cle ("real31_x"), pour l'affichage
--     admin ("de quelle cle s'agit-il ?") sans jamais re-exposer le secret.
--   - manager_id NULL = cle CABINET, lecture transverse SEULEMENT ; TOUTE ecriture
--     exige une cle liee a un gestionnaire (regle domain/cle-api.ts, verifiee serveur).
--   - Revocation logique (revoked_at) : on garde la ligne pour l'audit.
--
-- Correspond EXACTEMENT a ce que lit/ecrit l'adapter
-- src/lib/adapters/supabase/supabase-cles-api-repository.ts :
--   SELECT id, nom, cle_hash, prefixe, scopes, manager_id, cree_par, created_at,
--          expires_at, revoked_at, last_used_at, usage_jour, usage_jour_date
--   INSERT nom, cle_hash, prefixe, scopes, manager_id, cree_par, expires_at
--   UPDATE revoked_at                                  (revocation)
--   UPDATE last_used_at, usage_jour, usage_jour_date   (compteur d'usage)
--
-- Pas de FK vers public."User" : reference logique par manager_id = public."User".id,
-- comme les autres tables intranet_* (minimise le drift Prisma cote App A).
-- RLS laissee off (comme le reste de public et les autres tables intranet_*) ;
-- l'intranet lit/ecrit via la cle service_role, le cloisonnement gestionnaire est
-- applique EN CODE (avecCleApi + services existants). Durcissement RLS avec l'auth Entra.

create table if not exists public.intranet_api_keys (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null,                        -- libelle humain ("MCP poste Sekou", "agent AG"...)
  cle_hash         text not null unique,                 -- sha256 hex de la cle complete (jamais le clair)
  prefixe          text not null,                        -- 8 premiers caracteres de la cle, pour affichage
  scopes           text[] not null default '{}',         -- 'lecture' | 'ecriture:supervision' | 'ecriture:compta'
  manager_id       text,                                 -- ref logique public."User".id ; NULL = cle cabinet (lecture seule)
  cree_par         text,                                 -- email/initiales du super-admin createur
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,                          -- NULL = pas d'expiration
  revoked_at       timestamptz,                          -- NULL = active ; renseigne = revoquee (audit conserve)
  last_used_at     timestamptz,                          -- derniere requete authentifiee avec cette cle
  usage_jour       int not null default 0,               -- compteur simple de requetes du jour (visibilite, pas de blocage)
  usage_jour_date  date                                  -- jour du compteur ; un autre jour -> le compteur repart a 1
);

-- Lecture chaude de l'auth : verifierCleApi resout la cle par son hash a CHAQUE requete API.
create index if not exists intranet_api_keys_hash_idx
  on public.intranet_api_keys (cle_hash);
