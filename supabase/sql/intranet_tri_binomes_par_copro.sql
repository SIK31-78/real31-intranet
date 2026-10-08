-- TRI DES E-MAILS : un gestionnaire peut avoir PLUSIEURS assistants, affectes par copro
-- (ADR-046, arbitrage Sekou du 08/10/2026 : Sandy CARRIER a Galiano GUAETTA et Julie
-- BOIRON, avec un partage clair de ses copropriétés).
--
-- A executer une fois dans le SQL editor Supabase, APRES intranet_tri_emails.sql.
--
-- CE QUE ÇA CHANGE. La premiere version de intranet_tri_binome tenait UN assistant par
-- gestionnaire (cle primaire = gestionnaire_email). Elle est remplacee par :
--   intranet_tri_binome       : un binome = un gestionnaire + UN assistant ; au plus un
--                               « principal » par gestionnaire (assistant par defaut).
--   intranet_tri_binome_copro : la copro (reference ESTALE) -> le binome qui s'en occupe,
--                               quand ce n'est pas le principal.
--
-- SECURITE. La table d'origine etait vide le 08/10/2026 (verifie par requete). Le bloc
-- ci-dessous refuse de la supprimer si elle contient la moindre ligne.

do $$
begin
  if to_regclass('public.intranet_tri_binome') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'intranet_tri_binome' and column_name = 'id'
     ) then
    raise notice 'intranet_tri_binome est deja au nouveau format : rien a faire.';
  elsif to_regclass('public.intranet_tri_binome') is not null then
    if exists (select 1 from public.intranet_tri_binome) then
      raise exception 'intranet_tri_binome contient des lignes : arret, rien n''est supprime.';
    end if;
    drop table public.intranet_tri_binome;
  end if;
end $$;

create table if not exists public.intranet_tri_binome (
  id                 uuid primary key default gen_random_uuid(),
  gestionnaire_email text not null,                  -- en minuscules
  assistant_email    text not null,                  -- en minuscules
  assistant_nom      text not null,
  principal          boolean not null default false, -- l'assistant des copros sans affectation
  maj_le             timestamptz not null default now(),
  maj_par            text not null,
  unique (gestionnaire_email, assistant_email)
);

-- Au plus un assistant principal par gestionnaire.
create unique index if not exists intranet_tri_binome_principal_idx
  on public.intranet_tri_binome (gestionnaire_email)
  where principal;

create table if not exists public.intranet_tri_binome_copro (
  copro_reference text primary key,                  -- reference ESTALE, ex. S0297
  binome_id       uuid not null references public.intranet_tri_binome (id) on delete cascade,
  maj_le          timestamptz not null default now(),
  maj_par         text not null
);

-- Controle
select 'intranet_tri_binome' as table_, count(*) from public.intranet_tri_binome
union all select 'intranet_tri_binome_copro', count(*) from public.intranet_tri_binome_copro;
