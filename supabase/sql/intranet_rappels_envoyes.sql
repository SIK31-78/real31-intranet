-- Trace des rappels automatiques deja envoyes (REA-140, 12/10/2026).
-- A executer UNE FOIS dans le SQL editor Supabase (base patron). Re-executable sans risque.
--
-- POURQUOI. Le cron quotidien /api/cron/rappel-comptes-cs previent les comptables quand un
-- conseil syndical tombe dans les 10 jours et que les comptes ne sont pas verifies. La
-- fenetre fait 10 jours (rattrapage si le cron a manque un jour, ou si la date du CS a ete
-- posee tard) : sans trace, le meme rappel repartirait chaque matin. Une ligne par rappel
-- envoye, cle = 'rappel-comptes-cs|<copro>|<date du CS>'. Deplacer le CS a une autre date
-- cree une autre cle : le nouveau rendez-vous est rappele a son tour.
--
-- Tant que la table n'existe pas, le cron n'envoie RIEN et le dit dans sa reponse (il ne
-- prend pas le risque d'envoyer en double). Aucun ecran n'en depend.

create table if not exists public.intranet_rappels_envoyes (
  cle        text primary key,
  envoye_at  timestamptz not null default now()
);

-- RLS activee sans policy : acces via service_role uniquement (comme les autres tables intranet).
alter table public.intranet_rappels_envoyes enable row level security;

comment on table public.intranet_rappels_envoyes is
  'Rappels automatiques deja envoyes (idempotence des crons). Cle = type|copro|date. Une ligne = un rappel parti.';
