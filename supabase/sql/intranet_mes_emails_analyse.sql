-- Table native intranet : CACHE D'ANALYSE par mail (memoisation LLM). Un mail deja
-- analyse n'est jamais renvoye au modele. Cle (gestionnaire_id, internet_message_id)
-- -> internetMessageId est immuable (survit aux deplacements de dossier).
-- Distinct de intranet_mes_emails_etat (ce que le gestionnaire fait) et de
-- intranet_mes_emails_triage (la vue assemblee). A executer une fois.
--
-- prompt_version : si on change les prompts, on bumpe la version cote code et le
-- cache se reanalyse tout seul (les anciennes lignes ne matchent plus).

create table if not exists public.intranet_mes_emails_analyse (
  gestionnaire_id      text not null,
  internet_message_id  text not null,
  type                 text not null,
  ticketable           boolean not null default false,
  est_nouveau_ticket   boolean not null default false,
  confidence           real,
  rationale            text,
  brouillon            text,
  etapes               jsonb not null default '[]'::jsonb,
  model                text,
  prompt_version       text not null,
  analysed_at          timestamptz not null default now(),
  primary key (gestionnaire_id, internet_message_id)
);
