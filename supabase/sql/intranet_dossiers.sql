-- Table native intranet : DOSSIERS (cas suivis rattaches a une copro : sinistre,
-- travaux, impaye, procedure, recouvrement, question diverse, autre).
-- Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), comme les autres
-- tables natives intranet_* (jalons / supervision_items / odj_champs / facturation...).
-- Nommee intranet_dossiers pour la distinguer des tables Prisma (PascalCase) de l'App A.
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
--
-- Correspond EXACTEMENT a ce que lit/ecrit l'adapter
-- src/lib/adapters/supabase/supabase-dossier-repository.ts :
--   SELECT id, copropriete_id, type, portee, cible, titre, statut, origine, ag_date,
--          numero_resolution, etapes, journal, ouvert_par, ouvert_at
--   INSERT copropriete_id, type, portee, cible, titre, origine, etapes, journal,
--          ouvert_par            (id / statut / ouvert_at fournis par defauts)
--   UPDATE etapes, journal, statut, titre, cible, type, portee, ag_date,
--          numero_resolution, updated_at
--
-- Pas de FK vers public."Copropriete" : reference logique par copropriete_id = code copro,
-- comme intranet_jalons, pour ne rien imposer aux tables de l'App A (minimise le drift Prisma).
-- RLS laissee off (comme le reste de public et les autres tables intranet_*) ; l'intranet
-- lit/ecrit via la cle service_role, le cloisonnement gestionnaire est applique EN CODE
-- (getDossiers filtre par les copros du manager). Le durcissement RLS viendra avec l'auth Entra ID.

create table if not exists public.intranet_dossiers (
  id                 uuid primary key default gen_random_uuid(),
  copropriete_id     text not null,                          -- ref logique = code copro (referenceCrypto)
  type               text not null
                     check (type in ('travaux','sinistre','impaye','procedure',
                                     'recouvrement','question_diverse','autre')),
  portee             text not null
                     check (portee in ('copropriete','coproprietaire','lot')),
  cible              text,                                   -- nom du coproprietaire / ref du lot si portee != copro
  titre              text not null,
  statut             text not null default 'ouvert'
                     check (statut in ('ouvert','en_cours','clos')),
  origine            text,                                   -- texte libre legacy (ex "AG du 30/06 - resolution 7")
  ag_date            date,                                   -- rattachement AG (C5), ISO
  numero_resolution  text,                                   -- resolution d'AG dont decoule le dossier (C5)
  etapes             jsonb not null default '[]'::jsonb,     -- EtapeDossier[] (id/label/fait/assigneA/note...)
  journal            jsonb not null default '[]'::jsonb,     -- EvenementDossier[] (le/par/texte/kind/ref)
  ouvert_par         text,                                   -- initiales (ex 'EL') tant qu'il n'y a pas d'auth
  ouvert_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Lecture principale de l'adapter : listPourCopros(...) filtre sur copropriete_id et trie
-- par ouvert_at desc.
create index if not exists intranet_dossiers_copro_idx
  on public.intranet_dossiers (copropriete_id, ouvert_at desc);
