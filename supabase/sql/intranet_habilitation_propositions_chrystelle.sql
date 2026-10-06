-- Habilitation « propositions » pour Chrystelle BOUCHAUD (demande du patron, 06/10/2026).
--
-- Contexte : un prospect en copropriété (M. Daoudi, 12 rue Daniel à Asnières) qu'elle suit.
-- Même cas que Nicolas PELOQUIN le 21/09 : une GESTIONNAIRE habilitée nominativement,
-- le module n'étant pas ouvert à tout le cabinet (ADR-039).
--
-- CE QUE ÇA LUI DONNE : voir tout le pipeline des propositions, et compléter une fiche
-- (visite, contact, suivi). Fixer le prix, préparer et remettre l'offre, élire une
-- proposition restent à la DIRECTION de l'agence concernée - inchangé par ce script.
--
-- Idempotent : rejouable sans créer de doublon.

insert into public.intranet_habilitation (user_id, habilitation, agence, depuis, cree_par)
select u.id, v.habilitation, v.agence, date '2026-10-06', 'sql 06/10/2026'
from (values
  ('chrystelle.bouchaud@real31.fr', 'propositions', null)
) as v(email, habilitation, agence)
join public."User" u on lower(u.email) = v.email
where not exists (
  select 1 from public.intranet_habilitation h
  where h.user_id = u.id and h.habilitation = v.habilitation and h.agence is not distinct from v.agence and h.jusqua is null
);

-- Contrôle : qui peut voir le module Propositions
select u.name, u.role, h.habilitation, h.agence, h.depuis
from public.intranet_habilitation h join public."User" u on u.id = h.user_id
where h.habilitation = 'propositions' and h.jusqua is null
order by u.name;
