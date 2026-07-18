# Runbook de déploiement — 2026-07-18

Merge `integration/reprise-copro` (156 commits) → tronc `increment/02-supabase` → prod (Vercel de la collègue).

> Stratégie validée par Sekou : **merge direct sur le tronc + push prod**, avec **tous les interrupteurs en dry/lecture** pour commencer (aucune écriture eStale, aucun mail réel). On ouvre les vannes ensuite, une par une, une fois la prod vue tourner.

## État de préparation (fait par Claude, local, non poussé)

- Merge résolu localement sur `increment/02-supabase` (commit `74378cc`).
- Conflits : 4, tous résolus.
  - `graph-calendrier-outbound.ts` : `fetch` (tronc) vs `graphFetch` (nous) → **notre version** (timeout + retry GET-only de l'audit API). Sur-ensemble.
  - `projeter-evenement-outlook.ts` + son test : ajout `participants`/collaborateurs (nous, HEAD vide) → **notre version**.
  - `ROADMAP.md` : notre version (déjà sur-ensemble, mentionne « adresse dans l'objet »).
- Vérifié : `tsc --noEmit` = 0, `vitest run` = **795 tests**, `next build` = OK, `eslint src/` = 0 erreur.

## L'ordre compte : SQL + env AVANT le push

Le build prod servira le code dès qu'il est poussé. Avec les vannes en dry et la dégradation propre, l'ordre n'est pas catastrophique — mais le plus sûr reste **1 → 2 → 3**.

### 1. SQL à passer sur la base patron (Sekou, à la main)

6 tables sont **nouvelles** dans ces 156 commits et probablement absentes de la prod. À exécuter dans `supabase/sql/` (RLS activée, accès `service_role`) :

| Fichier | Porte |
|---|---|
| `reprise_dossier.sql` | le dossier de reprise (patrimoine + compta unifiés) |
| `reprise_dossier_jeu.sql` | le jeu extrait persisté |
| `reprise_mapping_decision.sql` | les décisions de mapping comptable |
| `reprise_fiche_renseignements.sql` | fiche de renseignements (token + code) |
| `intranet_confirmations_evenement_collaborateurs.sql` | colonne `collaborateurs_emails` (ALTER additif) |
| `intranet_projections_outlook.sql` | **créneaux mise sous pli / relance AG** (clé `(copro_code, role)`, sans date) |

Les autres SQL du dossier ont déjà été exécutés lors des sessions précédentes (à confirmer si doute). **Inoffensif si oublié** : `fiche_renseignements` et `projections_outlook` dégradent proprement (feature inerte, pas de crash). `reprise_dossier*` et `mapping_decision` sont **load-bearing** : la reprise casse sans elles.

### 2. Variables d'env sur Vercel (Sekou, dashboard → Settings → Environment Variables, Production)

**Les deux interrupteurs — en dry pour commencer :**

| Variable | Valeur de départ | Effet |
|---|---|---|
| `ESTALE_ECRITURE` | `dry` (ou absente) | aucune écriture eStale — tout est simulé |
| `MAIL_SOURCE` | **absente** | aucun mail réel envoyé |

**Variables de ce cycle à vérifier présentes** (sinon la feature est inerte ou grisée) :

| Variable | Rôle |
|---|---|
| `EXTRACTION_PROVIDER=mistral` | reprise compta/patrimoine via API Mistral (jamais le forfait Max) |
| `FICHE_PUBLIC_BASE_URL` | URL publique du formulaire de fiche de renseignements |
| `SIGNITIC_API_KEY`, `SIGNITIC_BASE_URL` | injection de signature serveur |
| `DIRECTEURS`, `MANAGERS`, `COMPTABLES`, `SUPER_ADMINS` | allowlists de rôles (CSV d'emails ; singulier toléré) |
| `MAIL_PILOTES` | allowlist pour l'ouverture progressive des mails (étape 2) |
| `COPRO_SOURCE=supabase` | l'app lit les 264 copros de la base patron |

Doivent déjà être en place (socle) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ESTALE_*` (creds), `AUTH_MICROSOFT_ENTRA_ID_*`, `MISTRAL_API_KEY`, `SITE_PASSWORD`.

### 3. Le push (Claude, sur go explicite de Sekou)

```
git push origin increment/02-supabase   # backup GitHub perso (skreal92)
git push deploy  increment/02-supabase   # → Vercel de la collègue, rebuild prod
```

Vercel rebuild automatiquement sur push de la branche de prod.

## 4. Smokes post-déploiement (Sekou, ~5 min)

- L'appli charge, connexion Entra OK, les 264 copros s'affichent.
- Une fiche copro s'ouvre (dates AG/CS, jalons).
- `/sinistre/wizard` : le parcours tourne, un sinistre s'enregistre et apparaît dans Mes dossiers.
- `/reprise-copro` : le hub s'affiche (pas d'écriture testée en dry).
- Aucune 500 dans les logs Vercel sur ces parcours.

## 5. Rollback

Le tronc distant avant merge = `c33deef` (mémorisé). Si la prod casse :

```
git push deploy c33deef:increment/02-supabase --force-with-lease
```

Vercel rebuild la version d'avant. (Alternative plus propre : `git revert -m 1 <sha du merge>` puis push — garde l'historique.)

## Après validation : ouvrir les vannes, une par une

1. `MAIL_SOURCE=graph` + `MAIL_PILOTES=sekou.koma@real31.fr` → tester l'envoi réel sur ta seule boîte.
2. Élargir `MAIL_PILOTES` aux gestionnaires quand c'est bon.
3. `ESTALE_ECRITURE=reel` **en dernier**, avec GO/STOP humain, une fois tout le reste éprouvé.

## Décisions métier encore ouvertes (n'empêchent pas le déploiement en dry)

- Exclusions IRSI du module sinistre : à valider contre le vrai texte IRSI.
- Délais flous des courriers sinistre C3/C7/C8.
- Notation des sujets Outlook : tiret (`S024 - Mise sous pli`) vs deux-points des AG/CS existants.
