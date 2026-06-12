-- Table native intranet : etat de l'ODJ (document de preparation d'AG issu du CS).
-- Vit dans le schema public de la base patron (tables natives dans public).
-- A executer une fois dans le SQL editor Supabase, puis activer la RLS
-- (service_role passe quand meme).
--
-- Le SQUELETTE de l'ODJ (sections, champs, points legaux pre-ecrits) vit en CODE
-- (lib/domain/odj.ts) ; cette table ne porte que l'ETAT saisi, cle par
-- (copropriete_id, ag_date, champ_id).
--   - champ_id = libelle stable d'un champ (ex 'lieu', 'modalite', 'presents',
--     ou un champ de section) : valeur = texte saisi par le gestionnaire.
--   - champ_id = 'point.<id>' (ex 'point.irve') : valeur = 'retire' quand le
--     gestionnaire ecarte un point legal non applicable.
--   - ag_date = date de l'AG ; ODJ sans AG planifiee = date sentinelle 0001-01-01
--     (meme convention que la supervision, reportee quand la date est fixee).
-- Pas de FK vers public."Copropriete" (reference logique, evite le drift Prisma).

create table if not exists public.intranet_odj_champs (
  id              uuid primary key default gen_random_uuid(),
  copropriete_id  text not null,
  ag_date         date not null,
  champ_id        text not null,
  valeur          text,
  marque_par      text,
  marque_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (copropriete_id, ag_date, champ_id)
);

create index if not exists intranet_odj_champs_ag_idx
  on public.intranet_odj_champs (copropriete_id, ag_date);
