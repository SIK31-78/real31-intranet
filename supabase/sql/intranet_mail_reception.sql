-- TRI DES E-MAILS : index local de la boite de reception des boites triees (ADR-046,
-- revision V2 du 27/10/2026, REA-419).
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent.
--
-- POURQUOI : la file a trier et le rangement automatique relisaient dans Graph les 100 mails
-- les plus recents de la reception, corps compris, a chaque affichage et toutes les 5 min. A
-- 130 mails par jour sur syndic2, un jour de retard rendait les plus anciens invisibles et
-- jamais ranges, et la pastille affichait 99+ sans que l'ecran les montre. Decision Sekou du
-- 27/10/2026 : lecture incrementale (requete delta de Graph) tout de suite, file sans borne,
-- les plus anciens en haut.
--
--   intranet_mail_reception : un mail de la reception par ligne, de quoi l'afficher et calculer
--                             sa suggestion sans relire Graph (corps en texte brut, plafonne a
--                             20 000 caracteres). `sorti_le` est pose quand il quitte la
--                             reception (range, supprime, glisse ailleurs) ; la ligne est
--                             oubliee 30 jours plus tard (purge de la tache planifiee).
--   intranet_mail_delta     : par boite, le lien de reprise de la lecture incrementale
--                             (deltaLink, ou nextLink d'un passage interrompu), le dernier
--                             passage et sa derniere erreur, et le debut d'une relecture
--                             complete en cours (`resynchro_le`).
--
-- SANS CE FICHIER L'APP TOURNE : la file, l'automatique et la pastille relisent la boite comme
-- avant (les 100 plus recents), et un avertissement part dans les journaux et Sentry.
--
-- RLS ACTIVEE SANS POLICY : ces tables contiennent le texte des mails. L'app ecrit et lit via
-- service_role (qui passe outre) ; la cle anon, publique, ne doit rien y lire.

create table if not exists public.intranet_mail_reception (
  boite               text not null,                    -- ex. syndic4@real31.fr
  internet_message_id text not null,                    -- identifiant RFC, stable
  message_id          text not null,                    -- id Graph dans la reception (change a chaque deplacement)
  conversation_id     text,
  expediteur_adresse  text not null default '',
  expediteur_nom      text,
  destinataires       text[] not null default '{}',     -- « À : » du mail
  objet               text not null default '',
  recu_le             timestamptz not null,
  apercu              text not null default '',         -- debut du corps
  corps               text not null default '',         -- texte brut nettoye, 20 000 caracteres au plus
  a_pieces_jointes    boolean not null default false,
  web_link            text,                             -- lien Outlook sur le web
  interne             boolean not null default false,   -- expediteur @real31.fr (calcule)
  indexe_le           timestamptz not null default now(),
  maj_le              timestamptz not null default now(),
  sorti_le            timestamptz,                      -- null tant que le mail est dans la reception
  primary key (boite, internet_message_id)
);

-- La file : les mails en reception d'une boite, du plus ancien au plus recent.
create index if not exists intranet_mail_reception_file_idx
  on public.intranet_mail_reception (boite, recu_le)
  where sorti_le is null;

-- La purge (sortis depuis plus de 30 jours).
create index if not exists intranet_mail_reception_sortis_idx
  on public.intranet_mail_reception (boite, sorti_le);

-- Les sorties du delta n'ont que l'id Graph (entrees @removed).
create index if not exists intranet_mail_reception_message_idx
  on public.intranet_mail_reception (boite, message_id);

create table if not exists public.intranet_mail_delta (
  boite        text primary key,
  delta_token  text,                                    -- deltaLink ou nextLink Graph ; null = tout relire
  maj_le       timestamptz not null default now(),      -- dernier passage
  erreur       text,                                    -- message du dernier passage en echec, null sinon
  resynchro_le timestamptz                              -- debut d'une relecture complete en cours
);

alter table public.intranet_mail_reception enable row level security;
alter table public.intranet_mail_delta enable row level security;

-- Controle : 2 tables (RLS activee), 3 index.
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('intranet_mail_reception', 'intranet_mail_delta')
 order by tablename;

select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('intranet_mail_reception_file_idx', 'intranet_mail_reception_sortis_idx', 'intranet_mail_reception_message_idx')
 order by indexname;
