-- Ajout des colonnes de SUIVI D'EQUIPE a public.reprise_dossier (module "Reprise de copro",
-- refonte ADR-037 : le module devient un tableau de suivi partage, l'import se fait au terminal).
--
-- À EXÉCUTER À LA MAIN une seule fois dans le SQL editor Supabase (base PARTAGÉE du
-- patron). Deploy-only : jamais de `migrate reset` / `db reset` sur cette base.
--
-- Trois colonnes NOUVELLES, toutes optionnelles (null = pas encore cadre) :
--   sortant      : nom usuel du syndic sortant (texte libre)
--   date_bascule : date d'effet du mandat (date de bascule comptable)
--   equipe       : qui tient chaque role sur ce dossier, JSONB
--                  { referent?: {id, nom}, gestionnaire?: {id, nom}, assistant?: {id, nom}, comptable?: {id, nom} }
--                  (type EquipeReprise, src/lib/reprise/domain/dossier.ts fait foi ; id = public."User".id)
--
-- Les autres ajouts de la refonte (assignation, note, echeance, majLe/majPar, etapes ad hoc,
-- auteur du journal) vivent dans les JSONB `etapes` et `journal` deja existants : ADDITIF, zero SQL.
--
-- Degradation propre : tant que ces colonnes n'existent pas, l'adapter Supabase rejoue l'upsert
-- sans elles (le reste du dossier persiste) et les lit comme absentes. Le tableau d'equipe marche
-- donc AVANT cet ALTER, sans equipe ni cadrage persistes. Une fois l'ALTER passe, tout est actif.

alter table public.reprise_dossier add column if not exists sortant text;
alter table public.reprise_dossier add column if not exists date_bascule date;
alter table public.reprise_dossier add column if not exists equipe jsonb;

comment on column public.reprise_dossier.sortant is
  'Syndic sortant (nom usuel), pour le tableau de suivi d''equipe. Null tant que le cadrage n''est pas fait.';
comment on column public.reprise_dossier.date_bascule is
  'Date de bascule (date d''effet du mandat). Null tant que le cadrage n''est pas fait.';
comment on column public.reprise_dossier.equipe is
  'Equipe du dossier (EquipeReprise : referent/gestionnaire/assistant/comptable -> {id, nom}). Sert de defaut d''assignation des etapes par role.';
