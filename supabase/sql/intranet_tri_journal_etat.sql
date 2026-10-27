-- TRI DES E-MAILS : journal transactionnel et un seul rangement actif par mail (ADR-046,
-- revision V2 du 27/10/2026, REA-420).
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent.
--
-- POURQUOI : le rangement deplacait le mail dans Outlook PUIS ecrivait sa ligne de journal.
-- Supabase en panne ou la fonction coupee entre les deux = un mail dans le dossier du binome
-- sans ligne : invisible dans « E-mails » (qui distribue d'apres le journal), jamais repris.
-- Mesure a Houilles le 27/10/2026 : 0 cas sur 317, mais l'exposition monte avec trois boites
-- et un cron par boite. Et rien n'empechait deux gestes (deux passages du cron, le cron et un
-- clic) de ranger le meme mail en meme temps.
--
--   etat          : 'en_cours' = ligne ecrite AVANT le deplacement, pas encore confirmee ;
--                   'fait' = rangement confirme (valeur par defaut : les lignes existantes et
--                   celles ecrites par l'ancien code sont 'fait').
--   annule_raison : pourquoi l'app a annule d'elle-meme une ligne (annule_par = 'systeme') :
--                   deplacement refuse, mail reste en reception ou introuvable a la reprise.
--   index partiel : les lignes 'en_cours' d'une boite, pour la reprise de la tache planifiee.
--   index UNIQUE  : un seul rangement reel actif (non annule) par (boite, mail). Le second
--                   geste recoit 23505, que l'app traite comme « deja range ».
--
-- AVANT l'index unique, les doublons actifs existants sont annules (on garde la ligne la plus
-- recente ; annule_par = 'doublon-2026-10-27') et leur nombre est affiche.
--
-- SANS CE FICHIER L'APP TOURNE comme avant : journal ecrit apres le deplacement, lectures sans
-- le filtre `etat`, pas d'index unique.

alter table public.intranet_tri_journal
  add column if not exists etat text not null default 'fait';
alter table public.intranet_tri_journal
  add column if not exists annule_raison text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'intranet_tri_journal_etat_check') then
    alter table public.intranet_tri_journal
      add constraint intranet_tri_journal_etat_check check (etat in ('en_cours', 'fait'));
  end if;
end $$;

-- Les rangements interrompus a reprendre (tache planifiee, par boite, les plus anciens d'abord).
create index if not exists intranet_tri_journal_en_cours_idx
  on public.intranet_tri_journal (boite, fait_le)
  where etat = 'en_cours';

-- Dedoublonnage des rangements reels actifs : on garde le plus recent. Affiche le nombre de
-- lignes annulees (0 attendu : aucun doublon constate a Houilles le 27/10/2026).
with classees as (
  select id,
         row_number() over (partition by boite, internet_message_id order by fait_le desc, id desc) as rang
    from public.intranet_tri_journal
   where annule_le is null
     and simulation = false
), annulees as (
  update public.intranet_tri_journal j
     set annule_le = now(),
         annule_par = 'doublon-2026-10-27',
         annule_raison = 'doublon actif avant l''index unique (REA-420)'
    from classees c
   where j.id = c.id
     and c.rang > 1
  returning j.id
)
select count(*) as doublons_annules from annulees;

-- Un seul rangement reel actif par mail.
create unique index if not exists intranet_tri_journal_actif_unique
  on public.intranet_tri_journal (boite, internet_message_id)
  where annule_le is null and simulation = false;

-- Controle : 2 colonnes, 1 contrainte, 2 index.
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'intranet_tri_journal'
   and column_name in ('etat', 'annule_raison')
 order by column_name;

select conname
  from pg_constraint
 where conname = 'intranet_tri_journal_etat_check';

select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('intranet_tri_journal_en_cours_idx', 'intranet_tri_journal_actif_unique')
 order by indexname;
