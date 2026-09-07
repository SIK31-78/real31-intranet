-- Points a porter a ESTALE (bloquants, questions, demandes) - outil ADMIN de Sekou,
-- remplace le fichier de notes. Page /admin/estale, garde super-admin cote app.
-- Idempotent. RLS laissee off comme le reste de public (service_role bypasse).
create table if not exists public.intranet_points_estale (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  detail text,
  bloquant boolean not null default false,
  categorie text not null default 'produit'
    check (categorie in ('produit', 'migration', 'usage')),
  statut text not null default 'a_trancher'
    check (statut in ('a_trancher', 'a_envoyer', 'envoye', 'repondu', 'resolu', 'abandonne')),
  reponse text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  resolu_at timestamptz
);

-- Rattrapage (si la table a ete creee avant l'ajout des categories le 07/09) :
-- rejouable sans risque.
alter table public.intranet_points_estale
  add column if not exists categorie text not null default 'produit';
do $$
begin
  alter table public.intranet_points_estale
    add constraint intranet_points_estale_categorie_check
    check (categorie in ('produit', 'migration', 'usage'));
exception
  when duplicate_object then null;
end $$;

-- Rattrapage 2 (07/09) : demandeur (initiales du collaborateur a l'origine du point,
-- rempli notamment par la conversion depuis une remontee feedback). Rejouable.
alter table public.intranet_points_estale
  add column if not exists demandeur text;
