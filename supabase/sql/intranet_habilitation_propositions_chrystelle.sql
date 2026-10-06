-- Chrystelle BOUCHAUD : accès au module Propositions + référente syndic d'ASNIÈRES.
-- Demande du patron du 06/10/2026, arbitrage Sekou le même jour.
--
-- CONTEXTE. Un prospect en copropriété (M. Daoudi, 12 rue Daniel à Asnières) qu'elle suit.
-- Chrystelle est aujourd'hui gestionnaire à LA GARENNE-COLOMBES, mais elle sera LA
-- gestionnaire d'ASNIÈRES : l'agence n'a pas encore d'activité syndic (0 copropriété,
-- 4 collaborateurs tous hors syndic au 06/10) et son portefeuille y bascule en JANVIER.
-- Même cas que Nicolas PELOQUIN, seul gestionnaire de Houilles, référent HLS depuis le
-- 21/09 : une gestionnaire qui porte une agence, habilitée nominativement (ADR-039).
--
-- CE QUE ÇA LUI DONNE
--   `propositions`            : voir tout le pipeline, compléter une fiche (contact,
--                               visite, suivi).
--   `referent_syndic` sur ASN : les gestes de DIRECTION, mais sur ASNIÈRES SEULEMENT -
--                               fixer le prix, préparer et remettre l'offre, élire une
--                               proposition. Et, le jour où l'agence aura des
--                               copropriétés, administrer son comptoir des clés et
--                               ouvrir un dossier de perte.
--   Sur LGC, où elle travaille aujourd'hui, elle reste gestionnaire : aucun droit de
--   direction ajouté.
--
-- À FAIRE EN JANVIER, quand le portefeuille bascule : passer son `agencyId` de LGC à ASN
-- dans public."User". Ce script ne touche pas à son rattachement.
--
-- Idempotent : rejouable sans créer de doublon.

insert into public.intranet_habilitation (user_id, habilitation, agence, depuis, cree_par)
select u.id, v.habilitation, v.agence, date '2026-10-06', 'sql 06/10/2026'
from (values
  ('chrystelle.bouchaud@real31.fr', 'propositions',    null),
  ('chrystelle.bouchaud@real31.fr', 'referent_syndic', 'ASN')
) as v(email, habilitation, agence)
join public."User" u on lower(u.email) = v.email
where not exists (
  select 1 from public.intranet_habilitation h
  where h.user_id = u.id and h.habilitation = v.habilitation and h.agence is not distinct from v.agence and h.jusqua is null
);

-- Contrôle : qui voit le module Propositions, et qui est référent de quelle agence
select u.name, u.role, h.habilitation, coalesce(h.agence, '(toutes)') as agence, h.depuis
from public.intranet_habilitation h join public."User" u on u.id = h.user_id
where h.jusqua is null
order by h.habilitation, u.name;
