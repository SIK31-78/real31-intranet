-- Table native intranet : confirmation des dates de CS / AG (demande patron, 2026-07).
-- Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), comme les autres
-- tables natives intranet_*.
--
-- Une date de CS / AG posee par le gestionnaire est d'abord PROVISOIRE (proposee au
-- conseil syndical par mail) : le planning affiche "AG a confirmer". Quand le CS valide
-- par retour de mail, le gestionnaire clique "Confirmer" -> "AG confirmee". Replanifier
-- la date invalide la confirmation (comparaison de date cote code, domaine pur).
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
-- Pas de contrainte FK vers public."Copropriete" : reference logique seulement,
-- pour ne rien imposer aux tables de l'App A (minimise le risque de drift Prisma).
-- Tant que la table n'existe pas, la fonctionnalite est inerte (lecture vide,
-- ecritures no-op) : l'app fonctionne comme avant.

create table if not exists public.intranet_confirmations_evenement (
  copro_code     text not null,                        -- code affiche de la copro, ex 'S024'
  type           text not null check (type in ('AG','CS')),
  date_evenement date not null,                        -- date proposee / confirmee
  statut         text not null default 'a_confirmer'
                 check (statut in ('a_confirmer','confirme')),
  confirme_le    timestamptz,
  confirme_par   text,                                 -- initiales du gestionnaire, ex 'EL'
  updated_at     timestamptz default now(),
  primary key (copro_code, type)
);

-- RLS activee sans policy : acces via service_role uniquement (comme les autres
-- tables intranet). Le cloisonnement gestionnaire est applique en code (managerId).
alter table public.intranet_confirmations_evenement enable row level security;

comment on table public.intranet_confirmations_evenement is
  'Confirmation des prochaines dates AG/CS : date proposee au conseil syndical (a_confirmer) puis validee par retour de mail (confirme). Une ligne par (copro, type) ; replanifier la date repasse a_confirmer.';
