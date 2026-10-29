-- BOÎTE D'ÉQUIPE DE L'ÉCRAN E-MAILS (ADR-053, 29/10/2026) : attribution d'un mail, notes
-- internes, en attente / de côté / relance.
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent (rejouable).
--
-- CLES :
-- - une NOTE suit le mail partout : cle = internet_message_id seul (il ne change pas quand le
--   mail change de dossier, part en Comptabilite ou bascule d'une boite a l'autre) ;
-- - une ATTRIBUTION et une ATTENTE sont un etat de la file ou se trouve le mail : cle =
--   (internet_message_id, boite), plus le dossier du tri au moment du geste (dossier_cle).
--   L'application les ignore quand le mail n'est plus dans ce dossier ou cette boite.
--
-- NOTES INTERNES : strictement internes, jamais envoyees, jamais ecrites dans Outlook. Leur
-- texte n'est ecrit dans aucun journal applicatif.
--
-- SANS CE FICHIER L'APP TOURNE : l'ecran E-mails s'affiche sans attribution, sans note et sans
-- attente (signale une fois par instance dans les journaux du serveur) ; les gestes repondent
-- « pas encore activees ».
--
-- RLS activee sans policy : seul service_role (le serveur de l'intranet) lit et ecrit.

-- 1. Attribution en cours : qui s'occupe du mail dans cette boite.
create table if not exists public.intranet_mail_attribution (
  internet_message_id    text not null,
  boite                  text not null,                 -- en minuscules
  dossier_cle            text,                          -- binome:..., comptabilite ; null = inconnu
  attributaire_email     text not null,                 -- en minuscules
  attributaire_nom       text not null,
  attributaire_initiales text not null,
  par_email              text not null,                 -- qui a fait le geste
  par_initiales          text not null,
  geste                  text not null check (geste in ('prendre', 'attribuer', 'reponse')),
  le                     timestamptz not null default now(),
  primary key (internet_message_id, boite)
);

-- 2. Historique minimal : qui a attribue a qui, quand (on n'y reecrit rien).
create table if not exists public.intranet_mail_attribution_historique (
  id                  bigint generated always as identity primary key,
  internet_message_id text not null,
  boite               text not null,
  dossier_cle         text,
  geste               text not null check (geste in ('prendre', 'attribuer', 'reponse', 'retirer')),
  attributaire_email  text,                             -- null pour 'retirer'
  par_email           text not null,
  le                  timestamptz not null default now()
);

create index if not exists intranet_mail_attribution_historique_mail_idx
  on public.intranet_mail_attribution_historique (boite, internet_message_id, le desc);

-- 3. Notes internes : plusieurs par mail, modifiees ou supprimees par leur auteur seulement.
create table if not exists public.intranet_mail_note (
  id                  uuid primary key default gen_random_uuid(),
  internet_message_id text not null,
  boite               text not null,                    -- ou la note a ete ecrite (information)
  auteur_id           text not null,                    -- public."User".id
  auteur_email        text not null,
  auteur_nom          text not null,
  auteur_initiales    text not null,
  texte               text not null check (char_length(texte) between 1 and 2000),
  cree_le             timestamptz not null default now(),
  modifie_le          timestamptz
);

create index if not exists intranet_mail_note_mail_idx
  on public.intranet_mail_note (internet_message_id, cree_le);

-- 4. En attente (datee), de cote (sans date), relance d'un mail envoye (datee).
create table if not exists public.intranet_mail_attente (
  internet_message_id text not null,
  boite               text not null,
  nature              text not null check (nature in ('attente', 'relance')),
  jusqu_au            timestamptz,                      -- null = de cote (attente seulement)
  conversation_id     text,                             -- pour voir une reponse arrivee dans le fil
  dossier_cle         text,
  depuis              timestamptz not null,             -- une reponse compte apres cet instant
  par_email           text not null,
  par_initiales       text not null,
  pose_le             timestamptz not null default now(),
  primary key (internet_message_id, boite),
  constraint intranet_mail_attente_relance_datee check (nature = 'attente' or jusqu_au is not null)
);

alter table public.intranet_mail_attribution enable row level security;
alter table public.intranet_mail_attribution_historique enable row level security;
alter table public.intranet_mail_note enable row level security;
alter table public.intranet_mail_attente enable row level security;

comment on table public.intranet_mail_attribution is
  'Boite d''equipe (ADR-053) : qui s''occupe d''un mail dans une boite triee.';
comment on table public.intranet_mail_attribution_historique is
  'Boite d''equipe (ADR-053) : historique des attributions (prendre, attribuer, reponse, retirer).';
comment on table public.intranet_mail_note is
  'Boite d''equipe (ADR-053) : notes internes d''un mail, jamais envoyees ni ecrites dans Outlook.';
comment on table public.intranet_mail_attente is
  'Boite d''equipe (ADR-053) : mail en attente (date), de cote (sans date) ou relance d''un envoi.';

-- Controle apres passage (4 lignes, rowsecurity = true) :
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'intranet_mail_%'
--     and tablename in ('intranet_mail_attribution', 'intranet_mail_attribution_historique',
--                       'intranet_mail_note', 'intranet_mail_attente');
