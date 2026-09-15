-- Module « Propositions de contrat de syndic » (ADR-039, 15/09/2026). Trois choses :
--
-- 1. Le registre national des copropriétés (ANAH, open data), extrait Île-de-France :
--    ce qui pré-remplit une proposition depuis une adresse (lots, syndic en place, fin de
--    mandat, immatriculation). Rafraîchi par scripts/importer-registre-copros.mjs.
-- 2. Les propositions elles-mêmes : le pipeline commercial qui remplace l'Excel
--    « Suivi Proposition reprise syndic » (1 161 lignes reprises par
--    scripts/importer-propositions-excel.mjs).
-- 3. La composition du forfait dans la grille tarifaire (elle n'existait que dans l'Excel).
--
-- RLS laissée off comme le reste des intranet_* (service_role). Idempotent.

create table if not exists public.intranet_registre_copros (
  immatriculation     text primary key,
  nom_usage           text,
  adresse             text not null,                 -- numéro et voie
  code_postal         text not null,
  commune             text not null,
  adresses_compl      text[] not null default '{}',
  lots_total          integer,
  lots_principaux     integer,                       -- habitation, bureaux, commerces
  lots_habitation     integer,
  lots_stationnement  integer,
  periode_construction text,
  syndic_type         text,                          -- professionnel / bénévole / non connu
  syndic_nom          text,
  syndic_siret        text,
  mandat              text,                          -- Mandat en cours / Pas de mandat en cours / expiré...
  fin_mandat          date,
  date_maj_registre   date,
  longitude           double precision,
  latitude            double precision,
  -- Colonne de recherche : adresse + commune normalisées (sans accents, sans « rue »).
  recherche           text not null,
  importe_le          timestamptz not null default now()
);
create index if not exists intranet_registre_copros_recherche_idx
  on public.intranet_registre_copros using gin (to_tsvector('simple', recherche));
create index if not exists intranet_registre_copros_cp_idx
  on public.intranet_registre_copros (code_postal);
create index if not exists intranet_registre_copros_syndic_idx
  on public.intranet_registre_copros (syndic_nom);

comment on table public.intranet_registre_copros is
  'Registre national d''immatriculation des coproprietes (ANAH, open data), extrait Ile-de-France. Lecture seule, rafraichi par script.';

create table if not exists public.intranet_proposition (
  id                  uuid primary key default gen_random_uuid(),
  statut              text not null default 'en_cours'
                      check (statut in ('en_cours','accepte_cs','elu','refuse_cs','refuse_ag','refuse_real31','reporte')),
  agence              text,
  gestionnaire        text,
  origine             text check (origine in ('bouche_a_oreille','vitrine','internet','deja_client','autre')),
  immeuble            jsonb not null default '{}'::jsonb,   -- la fiche de visite
  contact             jsonb not null default '{}'::jsonb,
  prix                jsonb not null default '{}'::jsonb,   -- grille + retenu
  premier_contact     date,
  remise_proposition  date,
  ag_prevue           date,
  decision            date,
  commentaires        text,
  copropriete_id      text,                                  -- code copro une fois élue et reprise
  journal             jsonb not null default '[]'::jsonb,
  cree_par            text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists intranet_proposition_statut_idx on public.intranet_proposition (statut, updated_at desc);
create index if not exists intranet_proposition_agence_idx on public.intranet_proposition (agence);

comment on table public.intranet_proposition is
  'Propositions de contrat de syndic : le pipeline commercial (ADR-039). Immeuble, contact, prix et journal en JSONB.';

-- La composition du forfait, dans la grille tarifaire. Montants TTC annuels 2026.
insert into public.intranet_tarifs (annee, identifiant_prestation, libelle, montant_ttc)
values
  (2026, 'ForfaitBase',              'Prise en charge annuelle de la copropriété (forfait de base)', 2899),
  (2026, 'ForfaitParLot',            'Forfait : tarif par lot principal',                             202),
  (2026, 'SupChauffageCollectif',    'Forfait : supplément immeuble à chauffage collectif',           630),
  (2026, 'SupGardien',               'Forfait : supplément immeuble avec gardien',                    786),
  (2026, 'SupAscenseur',             'Forfait : supplément par ascenseur',                            158),
  (2026, 'SupPorteGarage',           'Forfait : supplément par porte de garage',                      113),
  (2026, 'TimbresParCoproprietaire', 'Forfait frais postaux par copropriétaire',                      21.70)
on conflict do nothing;
