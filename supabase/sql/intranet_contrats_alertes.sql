-- Garde-fou des dates de contrat (Sekou, 21/10/2026, apres Villa La Croix S111 : un contrat
-- edite avec une prise d'effet au 01/10/2027, un an trop tard).
--
-- L'ecran d'edition ALERTE sans bloquer (debut posterieur au lendemain du contrat precedent,
-- date d'AG de plus de 6 mois). Quand le gestionnaire passe outre, l'edition garde le texte
-- des alertes : on retrouve ces contrats apres coup.
--
-- Nullable : null = aucune alerte, ou edition d'avant cette colonne. Sans elle, l'intranet
-- trace les editions comme avant (sans les alertes).
--
-- A passer a la main dans l'editeur SQL Supabase (RLS off, comme le reste des
-- intranet_*). Idempotent.

alter table public.intranet_historique_contrats
  add column if not exists alertes text[];

comment on column public.intranet_historique_contrats.alertes is
  'Alertes de dates affichees et passees outre a l''edition. NULL = aucune.';
