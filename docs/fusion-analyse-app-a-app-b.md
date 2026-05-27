# Fusion App A / App B - analyse comparative (référence)

Document de référence produit le 2026-05-27, en amont de la décision d'unifier les deux
applications web de REAL31 en une seule plateforme. La stratégie retenue est formalisée
dans `DECISIONS.md` (ADR-021). Ce document garde la trace de l'analyse qui a mené à cette
décision, pour pouvoir y revenir.

- **App A** : Registre des mandats (`RegistreMandats`), en production.
- **App B** : Intranet REAL31 (ce dépôt), en bootstrap.

---

## 1. Profil App A - Registre des mandats

| Dimension | Constat |
|---|---|
| Métier | Gestion des mandats immobiliers (vente / gestion, dont contrats de syndic pour des SDC). Suivi de signature, dépôt PDF, relances, notifications. |
| Stack | Next.js 14 (App Router), React 18, Tailwind 3, TypeScript strict, npm |
| Données | PostgreSQL via Prisma 5. Prod sur Supabase (Paris, eu-west-3, plan Free, projet `vwmvmgljddbxazjjjbrn`). 43 users, 48 mandats réels. |
| Auth | Magic link maison (email) + sessions serveur (table `Session`, token hashé, 30 j). Rôles `USER` / `ADMIN`. Users synchronisés depuis une liste SharePoint `Collaborators`. Pas d'Entra ID pour l'auth utilisateur. |
| Intégrations | Microsoft Graph (Mail.Send app-only), SharePoint (stockage PDF + source users), OneSpan (signature électronique, en prod), Azure Document Intelligence (OCR scan-email). Entra ID en app-only (client credentials). |
| Jobs | 4 crons Vercel Pro (relances, sync users, OneSpan, scan-email) |
| Tests | Vitest (29 fichiers de tests unitaires) + Playwright configuré |
| Déploiement | Vercel Pro (fra1) + Gandi (`mandats.real31.app`). CI/CD = auto-deploy Vercel sur push GitHub (`EmmanuelLOPES/RegistreMandats`), pas de GitHub Actions. 18 variables d'env. |
| Sécurité données | Modèle applicatif : contrôle de rôle + paramètre `scope` (`mine` / `all`) vérifié côté API. RLS Postgres volontairement désactivée, Data API Supabase neutralisée (tout passe par Prisma server-side). |

**Architecture** : monolithe plat mais bien rangé par sous-domaine (`lib/mandates`,
`lib/onespan`, `lib/auth`, `lib/graph`, `lib/sync`). Pas de couche domaine ni
ports-adapters. Prisma est appelé directement dans une trentaine de fichiers (routes API
et lib). Routes API fines qui délèguent à `lib/`.

**Qualité** : nettement meilleure que "vibe-codée". TS strict, transactions pour la
cohérence des audit logs, retry/backoff sur Graph et OneSpan, idempotence (packages
OneSpan, scan-email), circuit breaker, logging pino. Dette visible : pas de tests
d'intégration ni e2e, quelques `any` (mocks de tests et 2-3 routes), `console.log`
résiduels, valeurs en dur (List ID SharePoint, timezone), gestion d'erreur inégale d'une
route à l'autre. C'est du code de production réel.

**Modèle de données** (Prisma, tables PascalCase, colonnes camelCase) : `User`, `Session`,
`MagicLinkToken`, `Mandate`, `MandateCounter`, `AuditLog`, `Notification`,
`ProcessedOnespanPackage`, `ProcessedScanEmail`.

---

## 2. Profil App B - Intranet REAL31

| Dimension | Constat |
|---|---|
| Métier | Surcouche de coordination AG/CS de copropriété (syndic). Planification, jalons réglementaires, fiche copro. |
| Stack | Next.js 16, React 19, Tailwind 4, TypeScript strict, pnpm |
| Données | supabase-js + migrations SQL via Supabase CLI prévus. ORM non tranché (ADR-015 ouvert). 1 migration (11 tables) écrite, pas encore poussée (projet Supabase pas créé, décision mutualisation en attente). |
| Auth | Entra ID SSO prévu (J1b, dépend du DSI), mock auth en J1a, mapping initiales / email. 6 rôles + scopes. |
| Intégrations | Graph / SharePoint / eStale / Entra prévus, pas commencés. |
| Tests | Aucun encore (vitest prévu) |
| Sécurité données | RLS Postgres dès J1 (ADR-011), cloisonnement par gestionnaire. |

**Architecture** : hexagonale stricte (domain / ports / adapters / services), 13 ADRs,
règle ESLint d'isolation des SDK. Conçue pour débrancher SharePoint vers eStale sans
toucher l'UI. Mais quasi aucun code applicatif (README placeholders).

**Modèle de données** (SQL, snake_case) : `users`, `copros`, `evenements`, `jalons`,
`item_odj`, `membres_cs`, `presence_pre_ag`, `cabinet_settings`, `audit_log`,
`activity_log`, `job_runs`.

---

## 3. Compatibilités et incompatibilités

**Ce qui converge** :

- Même socle de fond : Next.js App Router, TS strict, Vercel, Supabase Postgres, Microsoft
  Graph / SharePoint / Entra, même tenant Microsoft, même groupe REAL31.
- App A a déjà résolu en prod ce que B planifiait pour J3/J5 : client Graph robuste, sync
  SharePoint, Mail.Send, crons Vercel. Réutilisable.
- Recoupement métier réel : A gère déjà des contrats de syndic (clients SDC), B modélise
  les copropriétés. Les deux domaines peuvent se relier.

**Ce qui s'oppose** :

| # | Sujet | App A | App B | Gravité |
|---|---|---|---|---|
| 1 | Accès données | Prisma (connexion directe au pooler, bypass RLS) | supabase-js + RLS dès J1 | Forte. Conflit le plus structurant : Prisma et le modèle RLS d'ADR-011 ne cohabitent pas naturellement. |
| 2 | Nommage SQL | PascalCase / camelCase (Prisma) | snake_case | Moyenne. Un schéma partagé doit trancher. |
| 3 | Auth users | Magic link + sessions DB + source SharePoint | Entra ID SSO + mapping initiales | Forte. Deux modèles d'identité. |
| 4 | Rôles | USER / ADMIN | 6 rôles + scopes RLS | Moyenne. |
| 5 | Versions | Next 14 / React 18 / Tailwind 3 | Next 16 / React 19 / Tailwind 4 | Moyenne. Montée de version d'un côté. |
| 6 | Package manager | npm | pnpm | Faible. |
| 7 | État | En prod, données réelles, 43 users actifs | Vide, rien à casser | Forte. A ne peut pas tomber. |

---

## 4. Stratégies de fusion étudiées

### Stratégie A - Migration de A vers B (porter A dans l'archi hexagonale)

Finir les fondations de B, remodéliser le domaine mandats en hexagonal, porter la
plomberie de A en adapters, migrer les données, basculer le DNS.

- Coût : élevé, ~2 à 4 mois. On réécrit des features de prod qui marchent.
- Risques : élevés. Rupture d'une app utilisée quotidiennement, migration de données
  réelles, ré-authentification des 43 users, régressions possibles OneSpan / scan-email.
- Bénéfices : archi propre dès le départ, codebase unique, ADRs de B respectés.

### Stratégie B - Évolution de A (ajouter le domaine syndic dans A)

A reste en prod. On introduit progressivement une couche service/repository, on ajoute les
tables copros/evenements/jalons, on construit l'UI AG/CS comme nouveaux modules, en
réutilisant l'auth, Graph, SharePoint et les crons existants.

- Coût : moyen, ~1 à 2 mois.
- Risques : moyens-faibles. Pas de rupture. Risque principal : la dette de A grandit si on
  ne refactore pas, et deux domaines cohabitent dans un même schéma.
- Bénéfices : time-to-value rapide, prod préservée, infra éprouvée réutilisée.

### Stratégie C - Monorepo à socle partagé, plusieurs apps fines

Garder "mandats" et "syndic" comme deux apps distinctes, extraire les briques communes
(auth, Graph, SharePoint, audit, UI, accès Supabase) dans des packages partagés (pnpm
workspaces ou Turborepo).

- Coût : moyen, ~1.5 à 2.5 mois (extraction de packages a un coût initial).
- Risques : moyens-faibles. Complexité d'outillage monorepo à absorber.
- Bénéfices : meilleur équilibre long terme, séparation claire des deux métiers s'ils
  doivent le rester.

### Recommandation formulée

Préférence pour une évolution incrémentale (B), avec extraction monorepo (C) en cible si
une 2e app doit rester séparée, plutôt que la migration big-bang (A). Raison : A est en
prod avec données réelles et features non triviales qui marchent ; B est surtout du papier.
Le coût et le risque de A sont les plus élevés pour le bénéfice le moins urgent (la
pureté). Ce qui pourrait inverser ce choix : si le modèle de sécurité RLS de B est un
prérequis dur (RGPD, cloisonnement strict non négociable).

---

## 5. Décision retenue

Cf. `DECISIONS.md`, ADR-021. En résumé : **absorption de l'app A dans l'intranet** (pas
fusion 50/50), l'intranet hexagonal comme base cible et autorité de qualité, **MVP strict**
(5 écrans), coexistence des deux apps pendant ~5 à 7 mois, et cohabitation transitoire
Prisma / supabase-js comme dette technique bornée. Le placement du module Contrats
(module 7) est en attente de validation du dirigeant.

---

## 6. Questions business encore ouvertes

1. Cible : une seule app pour les mêmes utilisateurs, ou deux produits d'un même groupe
   partageant un socle ? Qui utilise quoi (équipe immobilier vs équipe syndic) ?
2. La "mutualisation Supabase" en attente concerne-t-elle bien le projet Supabase existant
   de l'app A (`vwmvmgljddbxazjjjbrn`, Paris) ?
3. RLS : exigence dure (RGPD / cloisonnement) ou confort ? Ça décide Prisma vs supabase-js.
4. Entra ID SSO : la demande DSI est-elle débloquée ? On bascule A vers Entra, ou on garde
   le magic link comme auth commune un temps ?
5. Lien de données : les copropriétés de B doivent-elles se relier aux mandats de syndic
   de A (mêmes clients SDC) ?
6. OneSpan / scan-email restent-ils centraux ? (valeur actuelle de A, chère à réécrire)
7. Contrainte délai / budget pour la fusion ?
8. Prisma vs supabase-js : choix imposé, ou tranché après ces réponses (ADR-015) ?
