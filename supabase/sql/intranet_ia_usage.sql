-- JOURNAL D'USAGE DE L'IA (ADR-051, 28/10/2026) : une ligne par appel au modèle.
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent.
--
-- POURQUOI : la reformulation des mails (bouton « Reformuler » de l'ecran E-mails) consomme les
-- credits API du plan Teams, qui s'arretent net une fois epuises. Ce journal dit qui consomme,
-- combien, avec quel modele, et porte le plafond quotidien par personne
-- (IA_REFORMULATION_PLAFOND_JOUR, 100 par defaut).
--
-- AUCUN TEXTE DE MAIL ICI : des compteurs (tokens, cout estime, duree) et un code court
-- d'issue (`erreur` : « delai », « credit », « controle:chiffres_perdus »...).
--
-- SANS CE FICHIER L'APP TOURNE : la reformulation marche, sans journal ni plafond quotidien,
-- signale une fois par instance dans les journaux du serveur.
--
-- RLS activee sans policy : seul service_role (le serveur de l'intranet) lit et ecrit.

create table if not exists public.intranet_ia_usage (
  id              bigint generated always as identity primary key,
  cree_le         timestamptz not null default now(),
  jour            date not null,                     -- jour a Paris, cle du plafond quotidien
  fonction        text not null,                     -- 'reformulation'
  gestionnaire_id text not null,                     -- id technique du collaborateur
  initiales       text not null,
  incarnation     boolean not null default false,    -- appel fait via « Changer de gestionnaire »
  modele          text not null,
  tokens_entree   integer not null default 0,
  tokens_sortie   integer not null default 0,
  cout_estime     numeric(10, 6),                    -- en dollars, null si prix inconnu
  duree_ms        integer not null default 0,
  succes          boolean not null,                  -- la reformulation a remplace le texte
  erreur          text                               -- code court, jamais un contenu
);

-- Le plafond quotidien compte les appels d'une personne pour une fonction, un jour donne.
create index if not exists intranet_ia_usage_quota_idx
  on public.intranet_ia_usage (gestionnaire_id, fonction, jour);

-- Le suivi du budget lit par periode.
create index if not exists intranet_ia_usage_cree_le_idx
  on public.intranet_ia_usage (cree_le desc);

alter table public.intranet_ia_usage enable row level security;

comment on table public.intranet_ia_usage is
  'Journal d''usage de l''IA (ADR-051) : une ligne par appel, compteurs seulement, jamais le texte d''un mail.';

-- Suivi du mois (a lancer a la main) :
--   select initiales, count(*) as appels, sum(cout_estime) as dollars,
--          count(*) filter (where not succes) as ecartees
--   from public.intranet_ia_usage
--   where cree_le >= date_trunc('month', now())
--   group by initiales order by dollars desc nulls last;
