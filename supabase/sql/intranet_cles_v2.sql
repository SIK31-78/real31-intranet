-- Gestion des cles, complement du 18/09/2026 (retours de Sekou apres la V1) :
--  1. un trousseau peut etre SENSIBLE (le conseil syndical ne veut pas qu'on remette les
--     cles sans accord) : aujourd'hui une etiquette sur le tiroir, demain une consigne
--     visible partout et une confirmation a la sortie ;
--  2. un pret peut aller a un COPROPRIETAIRE ou a un membre du CS (acces fibre, etc.),
--     pas seulement a une entreprise ou en interne.
-- Idempotent.

alter table public.intranet_cles_trousseau add column if not exists sensible boolean not null default false;
alter table public.intranet_cles_trousseau add column if not exists consigne text;

comment on column public.intranet_cles_trousseau.sensible is 'Le CS ne souhaite pas que les cles soient remises sans accord : consigne affichee, confirmation demandee a la sortie.';
comment on column public.intranet_cles_trousseau.consigne is 'Ce qu''il faut savoir avant de remettre ce trousseau (texte libre, affiche a la sortie).';

-- Le type de pret accepte « coproprietaire ». La contrainte d'origine liait interne <-> pas
-- d'entreprise ; elle devient : seul un pret « entreprise » porte une entreprise.
alter table public.intranet_cles_pret drop constraint if exists intranet_cles_pret_type_check;
alter table public.intranet_cles_pret add constraint intranet_cles_pret_type_check check (type in ('entreprise', 'interne', 'coproprietaire'));
alter table public.intranet_cles_pret drop constraint if exists intranet_cles_pret_interne_sans_entreprise;
alter table public.intranet_cles_pret add constraint intranet_cles_pret_interne_sans_entreprise check ((type <> 'entreprise') = (entreprise_id is null));

-- Controle : select column_name from information_schema.columns where table_name = 'intranet_cles_trousseau' and column_name in ('sensible', 'consigne');
