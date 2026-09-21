-- Forme juridique de chaque entité gérée : copropriété (loi de 1965), ASL ou AFUL
-- (ordonnance du 1er juillet 2004). Décision Sekou, 21/09/2026 : une colonne dans la
-- table Copropriete d'App A plutôt qu'une table intranet à part, pour que le contrat
-- (copro : « contrat de syndic » ; ASL/AFUL : « contrat de mandat du gestionnaire »)
-- sorte directement dans la bonne forme.
--
-- ⚠️ App A est le référentiel du patron (schéma Prisma). La colonne doit AUSSI être
-- déclarée dans son schema.prisma (`legalForm String @default("COPROPRIETE")`), sinon un
-- `prisma db push` la supprimerait. À lui signaler.
--
-- Rejouable : add column if not exists, et les update ne touchent que les lignes encore
-- en COPROPRIETE.

alter table public."Copropriete"
  add column if not exists "legalForm" text not null default 'COPROPRIETE';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Copropriete_legalForm_check') then
    alter table public."Copropriete"
      add constraint "Copropriete_legalForm_check"
      check ("legalForm" in ('COPROPRIETE', 'ASL', 'AFUL'));
  end if;
end $$;

-- Recensement du 21/09/2026, d'après les noms (à compléter à la main pour le reste).
update public."Copropriete" set "legalForm" = 'ASL'
 where "legalForm" = 'COPROPRIETE'
   and "referenceCrypto" in ('S157', 'S174', 'S061', 'S114', 'S141', 'S165', 'S263', 'S204');
   -- ASLCHATEAU, ASLZOLA (inactive), ASLMAISONS, ASLTEMPO, ASLGREENAV, ASLOPUS, ASLLECLOS, ASLPLAZZA

update public."Copropriete" set "legalForm" = 'AFUL'
 where "legalForm" = 'COPROPRIETE'
   and "referenceCrypto" in ('S170', 'S259', 'S172', 'S216');
   -- AFULMAUPAS, AFULARTS, AFULLONGUE, ILOTBLEUET (AFUL Îlot Lacroix Bleuets)

-- Contrôle
select "legalForm", count(*) from public."Copropriete" group by 1 order by 1;
select "referenceCrypto", "name", "status" from public."Copropriete" where "legalForm" <> 'COPROPRIETE' order by "legalForm", "referenceCrypto";
