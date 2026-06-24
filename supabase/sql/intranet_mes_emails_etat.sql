-- Table native intranet : etat de traitement du cockpit "Mes emails".
-- Le triage (mails + propositions) vient de l'assistant-ia ; cette table ne porte
-- que ce que le GESTIONNAIRE a fait dessus, cloisonne par gestionnaire.
-- Cle logique (gestionnaire_id, email_id). A executer une fois dans le SQL editor.
--
-- statut        : 'nouveau' | 'repondu' | 'classe' (traite)
-- etapes_faites : ordres des etapes du plan cochees, ex [1,3]
-- brouillon     : reponse editee a la main (null = on garde la proposition)
-- rattachement  : override du dossier choisi a la main (null = proposition gardee)

create table if not exists public.intranet_mes_emails_etat (
  id              uuid primary key default gen_random_uuid(),
  gestionnaire_id text not null,
  email_id        text not null,
  copropriete_id  text not null,
  statut          text not null default 'nouveau',
  etapes_faites   jsonb not null default '[]'::jsonb,
  lu              boolean not null default false,
  brouillon       text,
  rattachement    jsonb,
  copro_code      text,
  copro_nom       text,
  marque_par      text,
  marque_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (gestionnaire_id, email_id)
);

create index if not exists intranet_mes_emails_etat_gid_idx
  on public.intranet_mes_emails_etat (gestionnaire_id);
