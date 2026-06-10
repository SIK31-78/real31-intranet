-- Table native intranet : etat des jalons reglementaires d'AG (ADR-006).
-- Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), decision 2026-06-10.
-- Nommee intranet_jalons pour la distinguer des tables Prisma (PascalCase) de l'App A.
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
-- Pas de contrainte FK vers public."Copropriete" : reference logique seulement,
-- pour ne rien imposer aux tables de l'App A (minimise le risque de drift Prisma).
-- RLS laissee off (comme le reste de public) ; le cloisonnement gestionnaire
-- viendra avec l'auth Entra ID (RLS / vues).

create table if not exists public.intranet_jalons (
  id              uuid primary key default gen_random_uuid(),
  copropriete_id  text not null,                          -- ref logique vers public."Copropriete".id
  ag_date         date not null,                          -- date de l'AG concernee
  type            text not null check (type in ('ODJ_CS','DEVIS','CONVOC','POUVOIRS','TENUE')),
  cible_date      date not null,                          -- date cible calculee (ADR-006)
  realise_date    date,
  statut          text not null default 'a_faire'
                  check (statut in ('a_faire','accompli','en_alerte')),
  commentaire     text,
  marque_par      text,                                   -- initiales (ex 'EL') tant qu'il n'y a pas d'auth
  marque_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (copropriete_id, ag_date, type)
);

create index if not exists intranet_jalons_copro_ag_idx
  on public.intranet_jalons (copropriete_id, ag_date);
