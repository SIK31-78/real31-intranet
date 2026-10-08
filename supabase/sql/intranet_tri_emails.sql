-- TRI DES E-MAILS V2 (ADR-046, REA-29) : trois tables natives pour la boite partagee
-- generique (copro2@real31.fr, affichee « Syndic LGC »).
--
-- A executer une fois dans le SQL editor Supabase de la base cible
-- (lgrsnrclufsulglbwcqi), comme le reste de supabase/sql/. Idempotent.
--
-- POURQUOI TROIS TABLES
--   intranet_tri_binome  : ESTALE connait le gestionnaire de chaque copro (mandat) mais
--                          presque jamais l'assistant. Le binome se tient donc ici.
--                          REMPLACEE le 08/10/2026 par intranet_tri_binomes_par_copro.sql
--                          (plusieurs assistants par gestionnaire, affectes par copro) :
--                          sur une base neuve, passer les deux fichiers dans l'ordre.
--   intranet_tri_dossier : l'id Outlook du dossier deja cree pour chaque binome (et pour
--                          « Comptabilité » / « Divers »). La cle est le GESTIONNAIRE, pas
--                          les initiales : quand l'assistant change, on renomme le dossier
--                          au lieu de deplacer les mails.
--   intranet_tri_journal : chaque rangement, avec le signal qui l'a propose et la copro
--                          choisie. C'est la mesure qui decidera quels signaux passent en
--                          rangement automatique (ADR-046, point 5).
--
-- RLS laissee off comme le reste de public : l'app ecrit via service_role, le
-- cloisonnement est en code (pilote super-admin).

create table if not exists public.intranet_tri_binome (
  gestionnaire_email text primary key,          -- en minuscules
  assistant_email    text not null,             -- en minuscules
  assistant_nom      text not null,
  maj_le             timestamptz not null default now(),
  maj_par            text not null
);

create table if not exists public.intranet_tri_dossier (
  boite     text not null,                      -- ex. copro2@real31.fr
  cle       text not null,                      -- 'binome:<email gestionnaire>' | 'comptabilite' | 'divers'
  folder_id text not null,                      -- id Graph du sous-dossier de la boite de reception
  nom       text not null,                      -- nom au dernier rangement, ex. 'SK-CP'
  maj_le    timestamptz not null default now(),
  primary key (boite, cle)
);

create table if not exists public.intranet_tri_journal (
  id                  uuid primary key default gen_random_uuid(),
  boite               text not null,
  internet_message_id text not null,            -- identifiant RFC, stable
  message_id          text not null,            -- id Graph APRES deplacement (annulation)
  expediteur          text not null,
  objet               text not null,
  copro_reference     text,                     -- null pour Comptabilité / Divers
  dossier_nom         text not null,
  signal              text,                     -- nature de la suggestion : sure, plusieurs, faible...
  candidats           text[] not null default '{}',
  simulation          boolean not null default false,  -- true = ecriture Graph coupee, le mail n'a pas bouge
  par                 text not null,            -- e-mail du collaborateur (ou 'automatique' plus tard)
  fait_le             timestamptz not null default now(),
  annule_le           timestamptz,
  annule_par          text
);

create index if not exists intranet_tri_journal_boite_idx
  on public.intranet_tri_journal (boite, fait_le desc);
-- Retrouver si un mail a deja un rangement en cours (file a trier, annulation).
create index if not exists intranet_tri_journal_message_idx
  on public.intranet_tri_journal (internet_message_id)
  where annule_le is null;

-- Controle
select 'intranet_tri_binome' as table_, count(*) from public.intranet_tri_binome
union all select 'intranet_tri_dossier', count(*) from public.intranet_tri_dossier
union all select 'intranet_tri_journal', count(*) from public.intranet_tri_journal;
