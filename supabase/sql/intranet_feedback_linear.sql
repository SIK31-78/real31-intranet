-- Pont REMONTEES COLLABORATEURS <-> LINEAR : trois colonnes de rapprochement sur
-- la table native intranet_feedback.
--
-- A executer une fois dans le SQL editor Supabase de la base cible
-- (lgrsnrclufsulglbwcqi), comme le reste de supabase/sql/.
--
-- POURQUOI : le bouton "Un bug / une idee" et Linear etaient deux saisies. Desormais
-- un cron quotidien (1) pousse dans Linear les remontees qui n'ont pas encore de
-- ticket, (2) relit l'etat des tickets connus et realigne le statut de la remontee.
-- Linear devient la source de verite du cycle de vie ; /nouveautes suit tout seul.
--
-- CES COLONNES SONT LA CLE DE RAPPROCHEMENT. Sans elles, l'adapter Supabase se
-- degrade proprement (lecture sans les champs Linear, ecriture qui leve une erreur
-- nommant ce fichier) - meme parti que intranet_feedback_resume_public.sql.

alter table public.intranet_feedback
  add column if not exists linear_issue_id   text,        -- uuid de l'issue Linear : LA cle de rapprochement
  add column if not exists linear_identifier text,        -- 'REA-87' : affichage + lien linear.app
  add column if not exists linear_sync_at    timestamptz; -- derniere synchro reussie (aller ou retour)

-- Une issue Linear ne peut etre rattachee qu'a UNE remontee : si un jour le push
-- est rejoue (cron relance, timeout a mi-chemin), l'index refuse le doublon plutot
-- que de laisser deux lignes pointer le meme ticket.
create unique index if not exists intranet_feedback_linear_issue_idx
  on public.intranet_feedback (linear_issue_id)
  where linear_issue_id is not null;

-- L'aller du cron cherche les remontees SANS ticket : index partiel sur ce cas.
create index if not exists intranet_feedback_sans_ticket_idx
  on public.intranet_feedback (created_at desc)
  where linear_issue_id is null;
