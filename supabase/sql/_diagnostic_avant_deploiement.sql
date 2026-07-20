-- ============================================================================
-- DIAGNOSTIC READ-ONLY - état de la base patron AVANT le déploiement 2026-07-18
-- À coller dans le SQL editor de Supabase (base patron). Ne MODIFIE rien.
-- Lit information_schema, renvoie une ligne par objet attendu avec son verdict.
-- Les ">>> ABSENT" remontent en haut : ce sont eux qu'il faut créer avant le push.
-- ============================================================================

with attendu(categorie, type, parent, objet) as (
  values
    -- === NOUVEAU CE CYCLE (à créer avant le push si ABSENT) ===
    ('1-cycle', 'table',   null,                               'reprise_dossier'),
    ('1-cycle', 'colonne', 'reprise_dossier',                  'jeu'),
    ('1-cycle', 'table',   null,                               'reprise_fiche_renseignements'),
    ('1-cycle', 'table',   null,                               'reprise_mapping_decision'),
    ('1-cycle', 'table',   null,                               'intranet_projections_outlook'),
    ('1-cycle', 'colonne', 'intranet_confirmations_evenement', 'collaborateurs_emails'),
    -- === SOCLE (doit déjà exister ; si ABSENT ici, un SQL antérieur a été oublié) ===
    ('2-socle', 'table',   null,                               'intranet_confirmations_evenement'),
    ('2-socle', 'colonne', 'intranet_confirmations_evenement', 'mode_reunion'),
    ('2-socle', 'colonne', 'intranet_confirmations_evenement', 'salle_email'),
    ('2-socle', 'colonne', 'intranet_confirmations_evenement', 'vehicule_email'),
    ('2-socle', 'table',   null,                               'intranet_jalons'),
    ('2-socle', 'table',   null,                               'intranet_supervision_items'),
    ('2-socle', 'table',   null,                               'intranet_odj_champs'),
    ('2-socle', 'table',   null,                               'intranet_listes_diffusion'),
    ('2-socle', 'table',   null,                               'intranet_mes_emails_analyse'),
    ('2-socle', 'table',   null,                               'intranet_mes_emails_etat'),
    ('2-socle', 'table',   null,                               'intranet_mes_emails_triage')
)
select
  a.categorie,
  a.type,
  coalesce(a.parent || '.', '') || a.objet                              as objet,
  case
    when a.type = 'table' then
      case when exists (
             select 1 from information_schema.tables t
             where t.table_schema = 'public' and t.table_name = a.objet
           ) then 'OK présent' else '>>> ABSENT - à créer' end
    else
      case when exists (
             select 1 from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = a.parent and c.column_name = a.objet
           ) then 'OK présent' else '>>> ABSENT - à créer' end
  end                                                                   as verdict
from attendu a
order by verdict asc, a.categorie, objet;  -- '>>> ABSENT' remonte avant 'OK'
