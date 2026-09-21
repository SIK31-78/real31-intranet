-- Habilitation « propositions » : qui voit le module Propositions de contrat. Décision
-- Sekou, 21/09/2026 : Léa LOUSSOUARN, Emmanuel LOPES, Sandy CARRIER, Dimitri MYAUX et
-- Nicolas PELOQUIN (seul gestionnaire de Houilles), plus les super-admins par le code.
-- Nicolas devient aussi référent syndic de Houilles : c'est lui qui fixe le prix et fait l'offre.
-- Rejouable.

alter table public.intranet_habilitation drop constraint if exists intranet_habilitation_habilitation_check;
alter table public.intranet_habilitation
  add constraint intranet_habilitation_habilitation_check
  check (habilitation in ('referent_syndic', 'propositions'));

insert into public.intranet_habilitation (user_id, habilitation, agence, depuis, cree_par)
select u.id, v.habilitation, v.agence, date '2026-09-21', 'sql 21/09/2026'
from (values
  ('lea.loussouarn@real31.fr',  'propositions',    null),
  ('emmanuel.lopes@real31.fr',  'propositions',    null),
  ('sandy.carrier@real31.fr',   'propositions',    null),
  ('dimitri.myaux@real31.fr',   'propositions',    null),
  ('nicolas.peloquin@real31.fr','propositions',    null),
  ('nicolas.peloquin@real31.fr','referent_syndic', 'HLS')
) as v(email, habilitation, agence)
join public."User" u on lower(u.email) = v.email
where not exists (
  select 1 from public.intranet_habilitation h
  where h.user_id = u.id and h.habilitation = v.habilitation and h.agence is not distinct from v.agence and h.jusqua is null
);

-- Contrôle
select u.name, h.habilitation, h.agence, h.depuis
from public.intranet_habilitation h join public."User" u on u.id = h.user_id
order by h.habilitation, u.name;
