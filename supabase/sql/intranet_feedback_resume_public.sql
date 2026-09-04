-- Resume PUBLIC des remontees (triage hebdo /corrections) : le seul texte long
-- expose sur /nouveautes. La description brute du collaborateur reste interne.
-- Idempotent. RLS laissee off comme le reste de public (service_role bypasse).
alter table public.intranet_feedback
  add column if not exists resume_public text;
