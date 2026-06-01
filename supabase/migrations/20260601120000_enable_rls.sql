-- Migration : activation de la RLS et policies user-facing.
-- Cf. ADR-011 : RLS activee des J1, complexification par ajout de policies.
--
-- AVERTISSEMENT MVP :
-- Sans auth Supabase reelle (Increment 3 mock auth pas encore livre),
-- `auth.uid()` retourne NULL et toutes les policies user-facing retournent
-- 0 ligne. L'acces se fait via le client service_role qui bypass la RLS
-- (cf. lib/adapters/supabase/admin.ts). Une fois l'auth branchee (mock puis
-- Entra ID J1b), la RLS protege effectivement le scope par gestionnaire
-- sans aucune modification de policies.

-- ============================================================================
-- Tables systeme : RLS on, aucune policy user.
-- Seul service_role accede (bypass RLS automatique). Une page admin pourra
-- exposer cabinet_settings via une policy ulterieure si besoin.
-- ============================================================================

alter table real31_intranet.cabinet_settings enable row level security;
alter table real31_intranet.audit_log         enable row level security;
alter table real31_intranet.job_runs          enable row level security;
alter table real31_intranet.activity_log      enable row level security;

-- ============================================================================
-- users : self-read uniquement.
-- Creation / mise a jour via service_role (admin tool).
-- ============================================================================

alter table real31_intranet.users enable row level security;

create policy "users self read"
  on real31_intranet.users
  for select
  to authenticated
  using (auth.uid() = id);

-- ============================================================================
-- copros : gestionnaire voit les copros qui portent ses initiales.
-- Ecritures via service_role uniquement (jobs de sync SharePoint/eStale).
-- ============================================================================

alter table real31_intranet.copros enable row level security;

create policy "copros scope gestionnaire"
  on real31_intranet.copros
  for select
  to authenticated
  using (
    gestionnaire_initials = (
      select gestionnaire_initials
      from real31_intranet.users
      where users.id = auth.uid()
    )
  );

-- ============================================================================
-- evenements / jalons / item_odj / presence_pre_ag : scope via la copro
-- proprietaire. La RLS sur copros transite en cascade (le sub-SELECT est
-- filtre par la policy "copros scope gestionnaire").
-- FOR ALL avec USING + WITH CHECK identiques : l'user ne peut ni lire,
-- ni ecrire une ligne pointant vers une copro hors scope.
-- ============================================================================

alter table real31_intranet.evenements enable row level security;

create policy "evenements via copro"
  on real31_intranet.evenements
  for all
  to authenticated
  using (
    exists (
      select 1 from real31_intranet.copros
      where copros.id = evenements.copro_id
    )
  )
  with check (
    exists (
      select 1 from real31_intranet.copros
      where copros.id = evenements.copro_id
    )
  );

alter table real31_intranet.jalons enable row level security;

create policy "jalons via evenement"
  on real31_intranet.jalons
  for all
  to authenticated
  using (
    exists (
      select 1 from real31_intranet.evenements
      where evenements.id = jalons.evenement_id
    )
  )
  with check (
    exists (
      select 1 from real31_intranet.evenements
      where evenements.id = jalons.evenement_id
    )
  );

alter table real31_intranet.item_odj enable row level security;

create policy "item_odj via evenement"
  on real31_intranet.item_odj
  for all
  to authenticated
  using (
    exists (
      select 1 from real31_intranet.evenements
      where evenements.id = item_odj.evenement_id
    )
  )
  with check (
    exists (
      select 1 from real31_intranet.evenements
      where evenements.id = item_odj.evenement_id
    )
  );

alter table real31_intranet.presence_pre_ag enable row level security;

create policy "presence_pre_ag via evenement"
  on real31_intranet.presence_pre_ag
  for all
  to authenticated
  using (
    exists (
      select 1 from real31_intranet.evenements
      where evenements.id = presence_pre_ag.evenement_id
    )
  )
  with check (
    exists (
      select 1 from real31_intranet.evenements
      where evenements.id = presence_pre_ag.evenement_id
    )
  );

-- ============================================================================
-- membres_cs : lecture via copro. Creation / mise a jour via admin tool.
-- ============================================================================

alter table real31_intranet.membres_cs enable row level security;

create policy "membres_cs lecture via copro"
  on real31_intranet.membres_cs
  for select
  to authenticated
  using (
    exists (
      select 1 from real31_intranet.copros
      where copros.id = membres_cs.copro_id
    )
  );
