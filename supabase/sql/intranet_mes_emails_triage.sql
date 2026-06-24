-- Table native intranet : CACHE du triage "Mes emails" (resultat du pipeline
-- d'ingestion : mails analyses + dossiers), une ligne par gestionnaire.
-- Remplace le fichier JSON local (inutilisable en prod Vercel, FS ephemere).
-- Le 'Synchroniser ma boite' ecrit ici ; le cockpit lit ici ; l'etat de
-- traitement vit a part dans intranet_mes_emails_etat.
-- A executer une fois dans le SQL editor Supabase.

create table if not exists public.intranet_mes_emails_triage (
  gestionnaire_id   text primary key,
  mails             jsonb not null default '[]'::jsonb,
  dossiers          jsonb not null default '[]'::jsonb,
  nb_mails_analyses integer not null default 0,
  sync_at           timestamptz,
  updated_at        timestamptz not null default now()
);
