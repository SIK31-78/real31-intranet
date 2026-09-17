-- Verrou anti-pilonnage de la fiche publique (audit du 16/09/2026, lot E).
-- Le compteur en memoire par IP ne tenait pas en serverless (une instance = un seau) : le
-- compte des mauvais codes vit desormais SUR LA FICHE, par token, et un verrou temporaire
-- s'applique apres 5 echecs (15 min), 10 (1 h), 20 (24 h). Un bon code remet a zero.
-- Idempotent. RLS laissee off comme le reste de public (acces service_role).
alter table public.reprise_fiche_renseignements
  add column if not exists echecs_code   integer     not null default 0,
  add column if not exists verrou_jusqua timestamptz;

comment on column public.reprise_fiche_renseignements.echecs_code is
  'Mauvais codes personnels saisis d''affilee (remis a 0 par un bon code). Cf. domain/fiche-renseignements.ts apresEchecCode.';
comment on column public.reprise_fiche_renseignements.verrou_jusqua is
  'Tant que now() < verrou_jusqua, le code n''est pas verifie : meme reponse qu''un mauvais code (anti-enumeration).';
