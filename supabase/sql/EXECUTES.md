# Registre des SQL — `supabase/sql/`

**Règle** : ces fichiers ne passent PAS par `supabase/migrations/`. **Sekou les exécute à la main** dans la base patron (Supabase SQL editor), puis **coche ici**. L'app lit/écrit via `service_role` (RLS laissée off sur `public`, cf. `intranet_jalons.sql`).

Statuts : ✅ exécuté · 🔲 en attente · ❔ à confirmer par Sekou.

> ⚠️ **`create table if not exists` ne rattrape JAMAIS une colonne ajoutée après coup.** Si la table existe déjà, rejouer le fichier ne fait rien — la colonne reste absente alors que le fichier la déclare. C'est le bug du 2026-07-28 sur `intranet_confirmations_evenement` (projection Outlook morte en silence). **Toute colonne ajoutée après la création initiale doit AUSSI apparaître en `alter table ... add column if not exists`** dans le même fichier.
>
> ⚠️ **Un ✅ ici n'est PAS une preuve.** Le 2026-07-28, `intranet_copro_dates` était marquée ✅ depuis le 21/07 alors qu'elle était ABSENTE de la base — conséquence : toutes les dates AG/CS des copros eStale étaient silencieusement perdues. **Quand un symptôme sent le « rien ne se passe », interroger la base** (un `select` sur la table : `200` = existe, `404 PGRST205` = absente), pas ce tableau.

| Fichier | Statut | Notes |
|---|---|---|
| `intranet_jalons.sql` | ❔ | Socle jalons (RLS off assumée). |
| `intranet_jalons_types_postag.sql` | ❔ | Extension des types de jalons post-AG. |
| `intranet_supervision_items.sql` | ❔ | Items de supervision. |
| `intranet_odj_champs.sql` | ❔ | Champs ODJ. |
| `intranet_odj_champs_reprise_date_sentinelle.sql` | 🔲 | **À PASSER** — reprise de données, pas une migration de schéma. Répare les saisies d'ODJ tombées sur la date sentinelle `0001-01-01` : la lecture repliait une URL sans date (`/odj/S273`) sur la prochaine AG de la copro, l'écriture sur la sentinelle → **tout ce qui était saisi depuis une URL nue partait sur une ligne jamais relue**, sans erreur ni affichage. Le code est corrigé (résolution unifiée `lib/services/odj/resoudre-cle-odj.ts`) ; ce SQL rattrape l'existant. **Mesuré en base le 2026-08-17** : 17 lignes orphelines sur 9 copros, **les 9 ont une `nextAGDate` réelle** (100 % perdues), dont **3 clôtures de réunion** (S024/RB, S172/DM, S273/CHB) et 6 champs sur S290. Le script est **générique** (jointure `copropriete_id` = `Copropriete."referenceCrypto"`, pas de liste de codes figée) et **rejouable** : d'autres lignes sentinelles peuvent apparaître avant qu'il soit passé, et le relancer ensuite ne fait rien. **3 collisions** sur l'unicité `(copropriete_id, ag_date, champ_id)` — arbitrage : **la plus récente selon `marque_at` gagne, la perdante est supprimée** (le sens s'inverse selon les cas). Une copro **sans** `nextAGDate` reste sur la sentinelle (cas légitime). Contient un inventaire avant + un contrôle après (`a_reprendre` doit valoir 0). |
| `intranet_confirmations_evenement.sql` | 🔲 | **À REJOUER (2026-07-28)** — table présente, mais **`outlook_event_id` et `outlook_boite` ABSENTES en base** (vérifié : `42703` / `PGRST204`). Cause : la table a été créée avant l'ajout de ces colonnes au fichier, et `create table if not exists` ne rattrape rien. Effet : toute date d'AG/CS posée était créée dans Outlook **puis supprimée dans la seconde** par le filet anti-orphelin, sans aucune erreur à l'écran. Le fichier porte désormais des `alter table ... add column if not exists` : le rejouer en entier est sans risque et corrige. |
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
| `intranet_recap_ag_traitement.sql` | 🔲 | **À PASSER** — colonnes `traite_compta_at` / `traite_compta_par` sur `intranet_recap_ag` (marqueur « traité » de la file « Récaps d'AG reçus » de l'espace comptable). **Vérifié absentes en base le 2026-08-17** (`select=traite_compta_at` → `400 / 42703`). ⚠️ `create table if not exists` ne les rattrape pas : ce fichier est un `alter table ... add column if not exists`, idempotent. **Sans lui l'app tourne** : la file s'affiche, tout apparaît « à traiter », et le bouton « marquer traité » remonte une erreur explicite nommant ce fichier (pas de succès mensonger). ⚠️ Ne PAS détourner `notif_comptable_at` (elle trace un envoi de mail, jamais branché). |
| `intranet_tarifs_seed.sql` | ✅ | Seed tarifs (barème cabinet, 3 millésimes en base). |
| `intranet_suivi_contrats_seed.sql` | ✅ | Seed suivi contrats (jeu stopgap, montants NULL — remplacé par le réel). |
| `intranet_suivi_contrats_seed_reel.sql` | ✅ | Seed réel (honoraires par copro) — **chargé en base** (audit 2026-07-23 : 0 montant NULL). ⚠️ **fichier sorti du repo → `data/seeds/` (git-ignoré, données commerciales)**. |
| `intranet_produits.sql` | ✅ | Catalogue produits (product_id + comptes comptables Pennylane, gestion courante). |
| `intranet_gestion_courante.sql` | ✅ | Gestion courante. |
| `intranet_dossiers.sql` | ✅ | Type `gestion_courante` ajouté au `CHECK` — **vérifié en base le 2026-07-31** (`?type=eq.gestion_courante` → `200 []`, la valeur est acceptée ; une valeur refusée renverrait `400 / 22P02`). Le fichier porte un bloc `drop constraint if exists` + `add constraint` : le rejouer reste sans risque. *(Historique : `create table if not exists` ne touche PAS une contrainte existante — ajouter une valeur au CREATE ne suffit jamais.)* Ancienne note : **À REJOUER (2026-07-30)** — ajout du type de dossier `gestion_courante`. La contrainte `CHECK` sur `type` doit être remplacée : `create table if not exists` ne la touche pas, donc **sans ce rejeu, créer un dossier « Gestion courante » échouera** (violation de contrainte côté serveur) alors que l'option s'affiche dans le menu. Le fichier porte un bloc `drop constraint if exists` + `add constraint` : le rejouer en entier est sans risque. (Table déjà en place, vérifiée le 28/07 avec 14 lignes.) |
| `intranet_compta_notes.sql` | ✅ | Passé par Sekou ; **vérifié en base le 2026-07-28** (4 lignes). |
| `intranet_api_keys.sql` | ✅ | Passé par Sekou ; **vérifié en base le 2026-07-28** (2 clés). L'API v1 répond bien 401 (et non 503). |
| `intranet_annonces.sql` | ✅ | Table + **colonnes de ciblage `agences[]` / `emails[]`** passées ; **vérifié en base le 2026-07-28** (colonnes présentes) → annonces par agence / par collaborateur opérationnelles. |
| `intranet_feedback.sql` | ⚠️ | Table passée (+ ALTER `severite drop not null` du 2026-07-23). **Un 2e ALTER à rejouer** (2026-07-23, masquage réversible) : `alter table public.intranet_feedback add column if not exists archive_at timestamptz;`. Idempotent → repasser tout le fichier est sans risque. Sans lui, archiver/désarchiver lèvera une erreur colonne inconnue (le reste marche). |
| `reprise_dossier.sql` | ❔ | Reprise copro — dossier. |
| `reprise_dossier_jeu.sql` | ❔ | Reprise copro — jeu de test. |
| `reprise_fiche_renseignements.sql` | ❔ | Reprise copro — fiche renseignements. |
| `reprise_mapping_decision.sql` | ❔ | Reprise compta — décisions de mapping. |
| `_diagnostic_avant_deploiement.sql` | — | Script de diagnostic (lecture seule, pas une migration). |
