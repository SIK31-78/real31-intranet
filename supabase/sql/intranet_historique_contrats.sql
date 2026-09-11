-- Historique des contrats de syndic edites. Equivalent de la liste SharePoint
-- « Historique audit de creation contrat » du systeme MYTHEC, reprise le 2026-09-11.
--
-- POURQUOI ON LE GARDE, alors que le module ne fait « que » le document : c'est la
-- memoire des honoraires REELLEMENT portes au contrat. L'analyse des 460 generations
-- MYTHEC l'a montre : sur 231 coproprietes, 56 contrats portent des honoraires differents
-- de ceux du contrat en cours, parce qu'ils reprennent l'augmentation votee en AG (S065 :
-- 15 067,50 en base, 15 369 sur le contrat, soit +2,0 % exactement). Sans cet historique,
-- la prochaine edition repartirait du montant d'avant l'augmentation.
--
-- Il dit aussi ce qui a RATE : 117 des 460 generations MYTHEC ont fini en erreur, une sur
-- quatre. On garde ces lignes, elles expliquent les trous.
--
-- Pas de FK vers public."Copropriete" (reference logique par copropriete_id, comme
-- intranet_jalons / intranet_suivi_contrats) pour ne rien imposer aux tables de l'App A.
-- RLS laissee off comme le reste de public ; le cloisonnement gestionnaire est applique
-- en code (managerId).
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent.
-- Le seed des donnees reelles vit dans data/seeds/ (hors depot, comme les autres).

create table if not exists public.intranet_historique_contrats (
  id                     uuid primary key default gen_random_uuid(),
  copropriete_id         text not null,                  -- code affiche de la copro, ex 'S065'
  titre                  text,                           -- ex 'Contrat-S065-2025-09-12'
  date_ag                date,                           -- AG qui ouvre le cycle
  honoraires_gestion_ttc numeric(12,2),                   -- ce qui a ete PORTE au contrat
  forfait_postaux_ttc    numeric(12,2),
  adresse                text,                           -- telle qu'imprimee, pour relecture
  statut                 text not null
                         check (statut in ('termine', 'erreur')),
  chemin_document        text,                           -- emplacement SharePoint du legacy
  message_erreur         text,
  cree_le                timestamptz not null,
  cree_par               text,                           -- nom lisible (legacy) ou initiales
  created_at             timestamptz default now()
);

-- Lecture dominante : « la derniere edition de CETTE copropriete », pour pre-remplir.
create index if not exists intranet_historique_contrats_copro_date_idx
  on public.intranet_historique_contrats (copropriete_id, cree_le desc);

-- Anti-doublon a la reprise. PAS sur le titre : le legacy le compose du code copro et du
-- JOUR (« Contrat-S159-2025-04-17 »), donc deux generations du meme jour le partagent -
-- or ce sont de vraies lignes distinctes (un echec, puis la reprise qui reussit). 116 des
-- 460 lignes sont dans ce cas. L'horodatage a la minute, lui, les separe.
create unique index if not exists intranet_historique_contrats_copro_cree_idx
  on public.intranet_historique_contrats (copropriete_id, cree_le);

alter table public.intranet_historique_contrats enable row level security;

comment on table public.intranet_historique_contrats is
  'Historique des contrats de syndic edites (reprise de la liste SharePoint MYTHEC « Historique audit de creation contrat »). Sert a pre-remplir les honoraires de la prochaine edition avec ceux reellement portes au dernier contrat, augmentation d''AG comprise.';
