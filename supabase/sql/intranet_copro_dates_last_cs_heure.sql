-- ALTER separe (REA-109, 12/10/2026) : l'heure de debut d'un CS deja tenu.
--
-- La cloture de l'ODJ fait glisser la date du CS de « prochaine » vers « derniere ».
-- next_cs_date porte l'heure (timestamptz) mais last_cs_date est une date pure : l'heure
-- se perdait au glissement et la facture d'un CS depasse mettait 18:00 par defaut. On
-- passe last_cs_date en timestamptz, comme next_cs_date (meme convention : l'heure locale
-- est ecrite telle quelle, lue depuis la chaine).
--
-- Concerne les copros ESTALE seulement (table intranet_copro_dates). Les copros Crypto
-- n'ont rien a passer : public."Copropriete"."lastCSDate" est deja un timestamp.
--
-- A executer UNE FOIS dans le SQL editor Supabase (base patron lgrsnrclufsulglbwcqi).
-- Deploy-only : TANT QU'IL N'EST PAS PASSE, le code fonctionne comme avant (Postgres
-- ramene le "YYYY-MM-DDTHH:mm" ecrit au jour seul, l'heure reste inconnue -> defaut 18:00).
-- Les dates existantes deviennent minuit UTC, lu « pas d'heure » (comme next_*).
-- Rejouable : sur une colonne deja en timestamptz, la conversion est un no-op.

alter table public.intranet_copro_dates
  alter column last_cs_date type timestamptz using last_cs_date::timestamptz;

comment on column public.intranet_copro_dates.last_cs_date is
  'Dernier CS tenu (jour + heure de debut, REA-109). Minuit = heure inconnue.';
