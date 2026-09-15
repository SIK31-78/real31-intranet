-- Dossiers de PERTE de copropriété (Sekou, 15/09/2026) : le miroir du dossier de reprise.
-- Un dossier par AG qui nomme un autre syndic ; la checklist de la fiche process du
-- cabinet (17 étapes, 4 phases) vit dans le JSONB `etapes`, comme reprise_dossier.
--
-- Remplace la table de trace intranet_copros_perdues prévue le matin même (jamais créée) :
-- le dossier EST la trace. Le statut de la copro, lui, vit toujours dans Copropriete.status.
--
-- RLS laissée off comme le reste des intranet_* (service_role). Idempotent.

create table if not exists public.intranet_perte_dossier (
  id              uuid primary key default gen_random_uuid(),
  copropriete_id  text not null,                    -- code affiché (referenceCrypto), ex 'S182'
  copro_nom       text not null default '',
  date_ag         date not null,                    -- AG qui a nommé le nouveau syndic : tout se date depuis elle
  fin_gestion     date not null,                    -- dernier jour géré par le cabinet
  motif           text,
  statut          text not null default 'en_cours'
                  check (statut in ('en_cours', 'termine')),
  etapes          jsonb not null default '[]'::jsonb,
  journal         jsonb not null default '[]'::jsonb,
  cree_par        text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists intranet_perte_dossier_copro_ag_idx
  on public.intranet_perte_dossier (copropriete_id, date_ag);

comment on table public.intranet_perte_dossier is
  'Dossiers de perte de copropriete (module Perte de copro). Etapes et journal en JSONB. Un dossier par (copro, AG).';
