-- Table native intranet : listes de diffusion Crypto (increment 2 "dates CS/AG").
-- Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), comme les autres
-- tables natives intranet_*.
--
-- ROLE : fallback pour les destinataires du mail au conseil syndical. eStale reste la
-- source PRIMAIRE (owner.email des membres du conseil) ; cette table sert quand la copro
-- n'est pas encore sur eStale ou ne remonte pas d'email (le parc est sur Crypto jusqu'en
-- janvier). Importee une fois depuis data/Export crypto/listes_diffusion_20260630.csv
-- via scripts/import-listes-diffusion.mjs.
--
-- RAPPROCHEMENT liste <-> copro : la reference S### est extraite de la DESIGNATION
-- ("Conseil Syndical - S046" -> "S46", normalisee) ; c'est la cle la plus fiable (bien
-- plus que immeuble_code, un nom court Crypto type "ACACIAS"). copro_code = null si aucune
-- reference n'apparait dans le libelle (rapprochement impossible -> non pre-rempli).
--
-- CLASSIFICATION (type_liste) : d'apres le libelle (le seul signal sur) - la colonne
-- type_liste du CSV n'est PAS discriminante. 'conseil_syndical' | 'proprietaires' | 'autre'.
--
-- PII : la colonne emails contient des adresses de coproprietaires. Acces service_role
-- uniquement (RLS activee sans policy) ; jamais journalisees.
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Pas de FK vers
-- public."Copropriete" (reference logique seulement, minimise le drift Prisma). Tant que
-- la table n'existe pas, la fonctionnalite est inerte (lecture vide) : l'app degrade.

create table if not exists public.intranet_listes_diffusion (
  idref          text not null,                        -- id de la liste dans Crypto
  designation    text,                                 -- libelle, ex 'Conseil Syndical - S046'
  gestionnaire   text,                                 -- initiales du gestionnaire Crypto
  immeuble_code  text,                                 -- code court Crypto (ex 'ACACIAS')
  immeuble_ville text,
  copro_code     text,                                 -- reference S### normalisee (ex 'S46'), null si absente
  type_liste     text not null default 'autre'
                 check (type_liste in ('conseil_syndical','proprietaires','autre')),
  emails         text[] not null default '{}',         -- destinataires nettoyes (a+cc+cci fusionnes, internes REAL31 exclus, dedupliques)
  updated_at     timestamptz default now(),
  primary key (idref)
);

-- Lookup par copro : la cascade destinataires interroge (copro_code, type_liste).
create index if not exists intranet_listes_diffusion_copro_idx
  on public.intranet_listes_diffusion (copro_code, type_liste);

-- RLS activee sans policy : acces via service_role uniquement (comme les autres tables
-- intranet). Le cloisonnement gestionnaire est applique en code (managerId).
alter table public.intranet_listes_diffusion enable row level security;

comment on table public.intranet_listes_diffusion is
  'Listes de diffusion Crypto (fallback destinataires du conseil syndical). copro_code = reference S### extraite de la designation ; type_liste classifie par le libelle. Source primaire = eStale (owner.email).';
