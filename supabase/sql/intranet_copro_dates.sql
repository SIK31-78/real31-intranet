-- Table native intranet : dates d'AG / de CS des copros eSTALE (lues en direct sur l'API
-- eStale). Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), comme les
-- autres tables natives intranet_*.
--
-- POURQUOI cette table. eStale ne porte PAS les dates d'AG/CS planifiees (aucune AG n'y est
-- encore tenue : meetingDate vide, 0 meeting). Et on ne peut pas ecrire ces dates dans le
-- miroir public."Copropriete" : 3 des 7 copros eStale (S297, S303, S305) n'ont AUCUNE ligne
-- miroir. On stocke donc les dates cote intranet, par CODE copro (reference eStale normalisee,
-- ex "S300", "SE999"). Le composite lit ces dates EN PRIORITE ; a defaut il retombe sur la
-- ligne miroir des copros deja mirrorees (S299/S300/S302/SE999).
--
-- Colonnes next_* = timestamptz (l'heure de reunion compte) ; last_* = date pure (jour tenu).
--
-- A executer UNE FOIS dans le SQL editor Supabase de la base cible (Sekou l'execute a la main).
-- Pas de contrainte FK vers public."Copropriete" : reference logique seulement (les orphelines
-- n'y sont pas), pour ne rien imposer aux tables de l'App A (minimise le risque de drift Prisma).
-- Tant que la table n'existe pas, la fonctionnalite est inerte (lecture vide -> repli miroir,
-- ecriture non memorisee) : l'app fonctionne comme avant.

create table if not exists public.intranet_copro_dates (
  copro_code   text primary key,        -- reference eStale normalisee, ex 'S300' / 'SE999'
  next_ag_date timestamptz,             -- prochaine AG (jour + heure)
  next_cs_date timestamptz,             -- prochain conseil syndical (jour + heure)
  last_ag_date date,                    -- derniere AG tenue (jour)
  last_cs_date date,                    -- dernier CS tenu (jour)
  updated_at   timestamptz default now()
);

-- RLS activee sans policy : acces via service_role uniquement (comme les autres tables
-- intranet). Le cloisonnement gestionnaire est applique EN CODE (managerId resolu depuis les
-- collaborateurs eStale de la copro).
alter table public.intranet_copro_dates enable row level security;

comment on table public.intranet_copro_dates is
  'Dates d''AG / de CS des copros eStale (que eStale ne porte pas). Cle = reference eStale normalisee. Lues en priorite par le composite copro ; repli sur la ligne miroir pour les copros deja mirrorees.';
