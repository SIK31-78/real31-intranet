# Registre des SQL — `supabase/sql/`

**Règle** : ces fichiers ne passent PAS par `supabase/migrations/`. **Sekou les exécute à la main** dans la base patron (Supabase SQL editor), puis **coche ici**. L'app lit/écrit via `service_role` (RLS laissée off sur `public`, cf. `intranet_jalons.sql`).

Statuts : ✅ exécuté · 🔲 en attente · ❔ à confirmer par Sekou.

> ⚠️ **Un ✅ ici n'est PAS une preuve.** Le 2026-07-28, `intranet_copro_dates` était marquée ✅ depuis le 21/07 alors qu'elle était ABSENTE de la base — conséquence : toutes les dates AG/CS des copros eStale étaient silencieusement perdues. **Quand un symptôme sent le « rien ne se passe », interroger la base** (un `select` sur la table : `200` = existe, `404 PGRST205` = absente), pas ce tableau.

| Fichier | Statut | Notes |
|---|---|---|
| `intranet_jalons.sql` | ❔ | Socle jalons (RLS off assumée). |
| `intranet_jalons_types_postag.sql` | ❔ | Extension des types de jalons post-AG. |
| `intranet_supervision_items.sql` | ❔ | Items de supervision. |
| `intranet_odj_champs.sql` | ❔ | Champs ODJ. |
| `intranet_confirmations_evenement.sql` | ❔ | Confirmations d'événement. |
| `intranet_confirmations_evenement_ressources.sql` | ❔ | Ressources. |
| `intranet_confirmations_evenement_mode.sql` | ❔ | Mode de confirmation. |
| `intranet_confirmations_evenement_collaborateurs.sql` | ❔ | Colonne `collaborateurs_emails` (invités Outlook). |
| `intranet_pm_coffre.sql` | ❔ | Coffre gestionnaire de mots de passe. |
| `intranet_mes_emails_analyse.sql` | ❔ | Cockpit Mes emails — analyse. |
| `intranet_mes_emails_etat.sql` | ❔ | Cockpit Mes emails — état. |
| `intranet_mes_emails_triage.sql` | ❔ | Cockpit Mes emails — triage. |
| `intranet_projections_outlook.sql` | ❔ | Projections Outlook. |
| `intranet_listes_diffusion.sql` | ❔ | Listes de diffusion CS (base). |
| `intranet_listes_diffusion_edite.sql` | ✅ | Exécuté par Sekou le **2026-07-20** (colonne `edite_le`, save validé à l'écran). |
| `intranet_copro_dates.sql` | ✅ | **Repassé par Sekou le 2026-07-28** après constat qu'elle était ABSENTE (PGRST205) malgré un statut ✅ daté du 21/07 — le SQL n'avait pas abouti (ou visait une autre base). Sans elle, toute pose/effacement de date AG-CS sur une copro **eStale** était silencieusement perdue. Cycle pose/effacement vérifié à l'écran le 28/07. |
| `intranet_facturation.sql` | ✅ | Facturation (module bâti + validé sur un vrai brouillon Pennylane, ADR-032). |
| `intranet_recap_ag.sql` | ✅ | Récap AG. |
| `intranet_recap_ag_complements.sql` | ✅ | Compléments récap AG. |
| `intranet_tarifs_seed.sql` | ✅ | Seed tarifs (barème cabinet, 3 millésimes en base). |
| `intranet_suivi_contrats_seed.sql` | ✅ | Seed suivi contrats (jeu stopgap, montants NULL — remplacé par le réel). |
| `intranet_suivi_contrats_seed_reel.sql` | ✅ | Seed réel (honoraires par copro) — **chargé en base** (audit 2026-07-23 : 0 montant NULL). ⚠️ **fichier sorti du repo → `data/seeds/` (git-ignoré, données commerciales)**. |
| `intranet_produits.sql` | ✅ | Catalogue produits (product_id + comptes comptables Pennylane, gestion courante). |
| `intranet_gestion_courante.sql` | ✅ | Gestion courante. |
| `intranet_dossiers.sql` | ✅ | Passé par Sekou ; **vérifié en base le 2026-07-28** (14 lignes). |
| `intranet_compta_notes.sql` | ✅ | Passé par Sekou ; **vérifié en base le 2026-07-28** (4 lignes). |
| `intranet_api_keys.sql` | ✅ | Passé par Sekou ; **vérifié en base le 2026-07-28** (2 clés). L'API v1 répond bien 401 (et non 503). |
| `intranet_annonces.sql` | ✅ | Table + **colonnes de ciblage `agences[]` / `emails[]`** passées ; **vérifié en base le 2026-07-28** (colonnes présentes) → annonces par agence / par collaborateur opérationnelles. |
| `intranet_feedback.sql` | ⚠️ | Table passée (+ ALTER `severite drop not null` du 2026-07-23). **Un 2e ALTER à rejouer** (2026-07-23, masquage réversible) : `alter table public.intranet_feedback add column if not exists archive_at timestamptz;`. Idempotent → repasser tout le fichier est sans risque. Sans lui, archiver/désarchiver lèvera une erreur colonne inconnue (le reste marche). |
| `reprise_dossier.sql` | ❔ | Reprise copro — dossier. |
| `reprise_dossier_jeu.sql` | ❔ | Reprise copro — jeu de test. |
| `reprise_fiche_renseignements.sql` | ❔ | Reprise copro — fiche renseignements. |
| `reprise_mapping_decision.sql` | ❔ | Reprise compta — décisions de mapping. |
| `_diagnostic_avant_deploiement.sql` | — | Script de diagnostic (lecture seule, pas une migration). |
