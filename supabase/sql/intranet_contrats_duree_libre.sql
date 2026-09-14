-- Contrats de syndic a duree libre (Sekou, 14/09/2026) : 2 ans, ou 15 mois pour une
-- reprise, au lieu du « debut + 1 an » code en dur partout.
--
-- Jusqu'ici la fin d'un cycle etait DEDUITE (debut + 1 an - 1 jour). Elle devient une
-- donnee. Les deux colonnes sont NULLABLES : null = ancienne regle, ce qui laisse les
-- 514 cycles et 460 editions existants exactement comme ils sont.
--
-- A passer a la main dans l'editeur SQL Supabase (RLS off, comme le reste des
-- intranet_*). Idempotent.

alter table public.intranet_suivi_contrats
  add column if not exists fin_contrat date;

comment on column public.intranet_suivi_contrats.fin_contrat is
  'Fin du cycle. NULL = debut + 1 an - 1 jour (regle historique). Ecrit par le recap AG.';

-- L'historique des editions porte le cycle imprime sur le document : c'est ce que le
-- recap AG proposera en pre-remplissage.
alter table public.intranet_historique_contrats
  add column if not exists debut_contrat date,
  add column if not exists fin_contrat date;

comment on column public.intranet_historique_contrats.debut_contrat is
  'Debut du cycle tel qu''imprime sur le contrat. NULL pour les editions MYTHEC (non exportees).';
comment on column public.intranet_historique_contrats.fin_contrat is
  'Fin du cycle telle qu''imprimee sur le contrat. NULL pour les editions MYTHEC.';
