# Registre des SQL — `supabase/sql/`

**Règle** : ces fichiers ne passent PAS par `supabase/migrations/`. **Sekou les exécute à la main** dans la base patron (Supabase SQL editor), puis **coche ici**. L'app lit/écrit via `service_role` (RLS laissée off sur `public`, cf. `intranet_jalons.sql`).

Statuts : ✅ exécuté · 🔲 en attente · ❔ à confirmer par Sekou.

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
| `intranet_copro_dates.sql` | ✅ | Exécuté par Sekou le **2026-07-21**. |
| `intranet_facturation.sql` | ✅ | Facturation (module bâti + validé sur un vrai brouillon Pennylane, ADR-032). |
| `intranet_recap_ag.sql` | ✅ | Récap AG. |
| `intranet_recap_ag_complements.sql` | ✅ | Compléments récap AG. |
| `intranet_tarifs_seed.sql` | ✅ | Seed tarifs (barème cabinet, 3 millésimes en base). |
| `intranet_suivi_contrats_seed.sql` | ✅ | Seed suivi contrats (jeu stopgap, montants NULL — remplacé par le réel). |
| `intranet_suivi_contrats_seed_reel.sql` | ✅ | Seed réel (honoraires par copro) — **chargé en base** (audit 2026-07-23 : 0 montant NULL). ⚠️ **fichier sorti du repo → `data/seeds/` (git-ignoré, données commerciales)**. |
| `intranet_produits.sql` | ✅ | Catalogue produits (product_id + comptes comptables Pennylane, gestion courante). |
| `intranet_gestion_courante.sql` | ✅ | Gestion courante. |
| `intranet_dossiers.sql` | 🔲 | **En attente** (créé 2026-07-22). |
| `intranet_compta_notes.sql` | 🔲 | **En attente** (notes compta). |
| `intranet_api_keys.sql` | 🔲 | **En attente** — clés machine API v1 ; tant que non passé, l'API répond 503 `api_non_configuree`. |
| `intranet_feedback.sql` | 🔲 | **En attente** — système de remontée bug/idée + page Nouveautés ; tant que non passé : bouton et pages dégradent proprement (vitrine vide, bandeau admin). |
| `reprise_dossier.sql` | ❔ | Reprise copro — dossier. |
| `reprise_dossier_jeu.sql` | ❔ | Reprise copro — jeu de test. |
| `reprise_fiche_renseignements.sql` | ❔ | Reprise copro — fiche renseignements. |
| `reprise_mapping_decision.sql` | ❔ | Reprise compta — décisions de mapping. |
| `_diagnostic_avant_deploiement.sql` | — | Script de diagnostic (lecture seule, pas une migration). |
