-- Cockpit « Mes emails » (REA-423, 27/10/2026) : suppression des deux caches de l'ancienne synchro.
--
-- POURQUOI. Décision de Sekou du 27/10/2026 : pas d'IA pour le moment, « on enlève tout, on
-- verra plus tard ». Le code qui lisait et écrivait ces tables est retiré :
--   - intranet_mes_emails_analyse : cache de classification / brouillon par mail (modèle
--     Mistral), relu à chaque affichage pour donner un type au mail. Plus aucun lecteur.
--   - intranet_mes_emails_triage : instantané du triage par gestionnaire, écrit par la synchro
--     abandonnée le 23/08/2026 (lecture live des boîtes depuis). Plus aucun lecteur.
-- La table d'état intranet_mes_emails_etat (statut, brouillon édité, copro, dossier) RESTE.
--
-- QUAND. Après le déploiement du code de REA-423 : l'ancien code lit encore
-- intranet_mes_emails_analyse à chaque affichage de /mes-emails. Le supprimer avant
-- ferait échouer cette lecture.
--
-- IRRÉVERSIBLE : les analyses mises en cache sont perdues (aucune n'est plus affichée).
-- Rejouable : `drop table if exists`.

-- 1. Inventaire avant (pour mémoire) : nombre de lignes de chaque table, si elle existe.
select 'intranet_mes_emails_analyse' as table_, count(*) as lignes from public.intranet_mes_emails_analyse
union all
select 'intranet_mes_emails_triage', count(*) from public.intranet_mes_emails_triage;
-- (Si l'une des deux est déjà absente, cette requête échoue en 42P01 : passer directement au 2.)

-- 2. Suppression.
drop table if exists public.intranet_mes_emails_analyse;
drop table if exists public.intranet_mes_emails_triage;

-- 3. Contrôle : les deux colonnes doivent valoir NULL (table absente).
select
  to_regclass('public.intranet_mes_emails_analyse') as analyse_doit_etre_null,
  to_regclass('public.intranet_mes_emails_triage')  as triage_doit_etre_null;
