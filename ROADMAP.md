# ROADMAP.md - REAL31 Intranet

Roadmap macro jusqu'à la mise en production du MVP, puis aperçu post-MVP.

> **Convention** : ce fichier est la mémoire institutionnelle inter-sessions / inter-machines (Mac/PC). À lire en premier en début de session, à mettre à jour à chaque fin d'incrément ou de session significative.

---

## 📍 État actuel - 2026-06-09

- **Phase** : J2 anticipé - écrans MVP avec données mock (lancé en parallèle pendant que Supabase patron est gelé et que Entra ID DSI est en attente)
- **Branche Git active** : `increment/02-supabase`
- **Derniers incréments terminés** :
  - ✅ Increment 1 - Bootstrap (mergé via `increment/01-bootstrap`)
  - ✅ Migrations Supabase initiales (schéma complet sans RLS, commit 3d7f67c) - Increment 2 partiel, gelé sur le branchement cloud
  - ✅ Design system REAL31 (tokens Tailwind 4 @theme, primitives UI, app shell sidebar/topbar)
  - ✅ **Écran Dashboard** (mock, hexagonal complet : domain + port + adapter mock + service + page)
  - ✅ **Écran Calendrier AG/CS** (mock, 3 vues mois/semaine/liste, filtres types, agenda latéral)
  - ✅ **Écran Supervision AG** (mock, 5 sections × 34 items, Server Actions + `useOptimistic`, persistance module-level reset au restart `pnpm dev`, lien depuis chips AG du calendrier)
  - ✅ **Écran Fiche copro 360° light** (mock hexa, route `/copropriete/[code]` + liste `/copropriete`) : référentiel (port `CoproRepository`, source cible App A `public.Copropriete`) + blocs sourcés eStale mockés (port `CondoEstaleProvider` : Conseil Syndical, historique AG, conformité) + prochains événements (réutilise le calendrier). **Sans mini-map ni tantièmes** (décision 2026-06-09 → ADR-013 déprécié). Onglets Contrats/Sinistres/Compta/Documents grisés (post-MVP). typecheck + lint + build OK.
  - ✅ **Écran Mes événements** (mock hexa, route `/mes-evenements`) : vue agrégée cross-copros — À traiter (actions + urgence), AG à venir (progression jalons X/5), copros sans AG planifiée. Patron provider d'écran (comme le Dashboard). Sélecteur « Mode supervision » omis (post-MVP, ADR-009). typecheck + lint + build OK. **→ 5 écrans MVP terminés.**
- **Bloqueurs / en attente** :
  - ⏸️ **Base Supabase cible (nouvelle base patron)** : la base désignée est `lgrsnrclufsulglbwcqi` (≠ prod App A `vwmvmgljddbxazjjjbrn`). **Exploration faite le 2026-06-09** : c'est un **clone du modèle + données de l'App A** (Prisma `public`, `Copropriete` 264 / `User` 51, RLS off, pas de schéma `real31_intranet`). Le repo pointe **encore** sur l'ancienne base (rien rebranché). Direction pressentie = **Option C** (lire `public.Copropriete`/`User` comme référentiel via adapter, données natives intranet dans `real31_intranet`) — **à confirmer** avec le patron (référentiel partagé ? convergence App A dès le MVP ?). `db:push` **gelé**. Cf. memory `project_supabase_mutualisation.md`.
  - ⚠️ **Demande Entra ID App Registration au DSI** (J0) : toujours bloquant pour J1b.
- **Prochaine action concrète** : **les 5 écrans MVP sont faits** (livrable J2 : naviguer dans toute l'app en mock). Côté externe (hors code) : confirmer la gouvernance de la base Supabase (Option C) + relancer Entra ID DSI pour débloquer le branchement (J1b/J3). Côté code : durcir J2 si besoin (tests E2E Playwright, `docs/component-strategy.md`).

---

**Hypothèses de chiffrage** :
- 1 développeur, à plein temps ou quasi
- Mocks d'abord, branchements progressifs
- Validation manager continue (tests utilisateur informels chaque semaine)

**Légende** :
- 🔲 À faire
- 🔄 En cours
- ✅ Fait
- ⏸️ En attente (dépendance externe)
- ⚠️ Risque / blocage actif

---

## Périmètre MVP - rappel

- **Profils** : 4-7 **gestionnaires réels** du cabinet, cloisonnés strict (chacun voit ses copros uniquement). Cf. ADR-009.
- **Surcouche de coordination** au cœur (cf. ADR-008), mais le périmètre produit s'élargit désormais vers une plateforme unique à 8 modules (cf. ADR-021 et la section "Vision produit élargie" plus bas). Le MVP, lui, reste strict.
- **Modules MVP** : Planification CS/AG + Fiche copro 360° light + alertes basiques.
- **5 écrans** (cf. mockup) : Dashboard, Calendrier, Mes événements, Fiche prépa AG, Fiche copro 360°.
- **Hors MVP explicite** : tout le reste. Génération PDF, contrats, registre des mandats (app A), divers syndic, compta. Aucune anticipation de ces modules dans le code tant que les 5 écrans ne sont pas livrés.

---

## J0 - Préparation (en parallèle de J1a/J1b, ~1-2 semaines)

Phase **sans code applicatif**. On déverrouille les dépendances externes et on prépare les artefacts d'entrée.

- ⚠️ **Demande Entra ID App Registration au DSI** (cf. `docs/entra-app-registration.md`) - **bloquant pour J1b**, à déclencher immédiatement
- 🔲 Dépôt des artefacts par le user :
  - ✅ `real31-mockup.html` (référence UX, à la racine - pas dans `docs/`)
  - 🔲 `docs/estale-schema.json` (introspection GraphQL via `npx get-graphql-schema`)
  - 🔲 `docs/sharepoint-exports/` (exports bruts CSV/JSON des listes)
- 🔲 Production de :
  - 🔲 `docs/sharepoint-inventory.md` - inventaire structuré des listes SharePoint, mapping vers types domaine, signalement des champs ambigus
  - 🔲 Vérification que le schéma eStale couvre bien les besoins MVP
- 🔲 Création des comptes Vercel, Supabase (org EU), accès partagés

**Critère de sortie de J0** : on a la matière pour brancher SharePoint en J3 sans surprise majeure.

---

## J1a - Fondations techniques (sans dépendance DSI, semaines 1-2)

Squelette technique + auth **mock** pour pouvoir avancer pendant que la demande Entra ID circule. La séparation J1a / J1b est explicite pour ne pas être bloqué.

**Plan détaillé en 5 incréments** (cf. message de séquencement). Validation à chaque incrément avant de passer au suivant.

### Increment 1 - Bootstrap projet ✅ (mergé via `increment/01-bootstrap`)
- ✅ Repo Git initialisé
- ✅ `pnpm create next-app` - Next.js 16, TypeScript strict, App Router, ESLint, Tailwind (Node 22 LTS pin via fnm)
- ✅ Règle ESLint d'**isolation des adapters** (cf. ADR-001) - boundaries plugin
- ✅ Scripts package.json (`dev`, `build`, `lint`, `typecheck`)
- ✅ Scaffold `lib/` (domain, ports, adapters, services, jobs, audit, auth)
- ✅ README projet + page d'accueil J1a brandée
- ✅ Deploy Vercel : page vide propre
- **Validation** : ✅ `pnpm lint && pnpm typecheck && pnpm build` passe

### Increment 2 - Supabase + schéma initial 🔄 (branche `increment/02-supabase`)
- ✅ Supabase CLI installé + scaffold du projet local (commit 20302fa)
- ⏸️ Projet Supabase EU créé - **gelé en attendant décision mutualisation patron**
- 🔲 Variables d'env Vercel + `.env.local` documentées
- ✅ Migrations Supabase initiales (commit 3d7f67c, RLS désactivée comme prévu) :
  - ✅ `users`, `gestionnaires_mapping` (porté par `users.gestionnaire_initials` - cf. ADR-010)
  - ✅ `copros` (avec `source` discriminateur, `gestionnaire_initials`, lat/lng - cf. ADR-003, ADR-013)
  - ✅ `evenements`, `jalons`, `item_odj`, `presence_pre_ag`, `membres_cs`
  - ✅ `cabinet_settings`
  - ✅ `audit_log`, `activity_log` (cf. ADR-007)
  - ✅ `job_runs` (cf. ADR-004)
- 🔲 Client Supabase typé (codegen depuis le schéma)
- ✅ RLS **pas encore activée** (volontairement - increment 5)
- **Validation** : 🔲 tables visibles dans Supabase dashboard cloud + insert/select depuis le code (bloqué par mutualisation)

### Increment 3 - Mock auth + session
- 🔲 Provider d'auth dev : page `/dev-login` (réservée `NODE_ENV !== 'production'`) avec liste des gestionnaires fictifs (FS, KN, OR, SC + 1-2 autres)
- 🔲 Cookie de session signé (encapsulé pour swap futur vers Entra ID)
- 🔲 Middleware Next.js qui injecte la session dans le contexte des Server Actions et Route Handlers
- 🔲 Header UI avec nom/avatar + bouton déconnexion
- 🔲 Garde de route : tout `/app/**` redirige vers `/dev-login` si pas de session
- **Validation** : login en dev, nom dans header, déco fonctionne, route protégée respecte la garde

### Increment 4 - Audit middleware + activity_log + withAudit helper
- 🔲 Helper `withAudit({ action }, fn, { activity? })` (cf. ADR-007)
- 🔲 Capture du contexte utilisateur (ip, user-agent, user_id)
- 🔲 Écriture transactionnelle dans `audit_log` (+ `activity_log` si applicable)
- 🔲 Une route de test (Server Action) qui appelle `withAudit` pour valider de bout en bout
- 🔲 Page admin minimale `/admin/audit` (table append-only, recherche basique)
- **Validation** : action déclenche entrée `audit_log` ET `activity_log` quand applicable, visible sur `/admin/audit`

### Increment 5 - RLS sur copros + MockCoproAdapter + page de test
- 🔲 Activer RLS sur `copros`, `evenements`, `jalons`, `activity_log` (cf. ADR-011)
- 🔲 Policy MVP : "gestionnaire voit ses copros via `gestionnaire_initials`"
- 🔲 `MockCoproAdapter` retournant 15 copros fictives réparties sur les 4-6 gestionnaires
- 🔲 Seed `users` + `copros` avec des données mock cohérentes
- 🔲 Page test `/dev/copros` qui liste les copros visibles selon le user connecté
- 🔲 Tests : login FS -> 4 copros visibles. Login KN -> 3 autres. Aucune fuite.
- **Validation** : la RLS bloque effectivement les accès hors scope (vérifier en SQL direct aussi)

**Critère de sortie de J1a** : 5 incréments validés. La fondation tient. On peut commencer à construire les 5 écrans du mockup avec données mock, en attendant que J1b débranche le mock auth.

---

## J1b - Branchement Entra ID (déclenché par livraison DSI)

⏸️ **Dépendance bloquante** : retour App Registration du DSI.

- 🔲 Récupération des credentials (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`)
- 🔲 Décision ADR-017 : Auth.js v5 vs implémentation custom
- 🔲 Remplacement du mock auth par le vrai provider Entra ID
- 🔲 Page `/admin/users` pour mapper les vraies initiales aux vrais emails
- 🔲 Test SSO bout en bout : connexion d'un vrai compte M365 -> session OK -> copros filtrées
- 🔲 Suppression définitive de `/dev-login` en prod (env-guard)
- **Validation** : un vrai gestionnaire REAL31 peut se connecter avec son compte M365 et voir ses copros

---

## J2 - MVP fonctionnel avec MockProvider (semaines 3-4)

Construction des 5 écrans avec données mock. Si J2 fonctionne, le reste est du branchement.

- 🔲 Types domaine complets (cf. liste exhaustive dans ADR-001)
- 🔲 Ports : `CoproRepository`, `EvenementRepository`, `JalonRepository`, `ItemODJRepository`, `ActivityLogRepository`
- 🔲 `MockCoproAdapter`, `MockEvenementAdapter`, etc. avec données réalistes (10-15 copros, événements répartis sur 3 mois, jalons à différents états)
- 🔲 Lib `lib/domain/jalons-ag/` (cf. ADR-006) :
  - `legal/` : constantes immutables + tests exhaustifs
  - `cabinet/` : defaults REAL31 + table `cabinet_settings`
  - Calculator avec couverture tests > 90 %
- 🔄 5 écrans Next.js fidèles au mockup :
  - ✅ Dashboard (compteurs actionnables, attention, flux activité) - hexa mock complet
  - ✅ Calendrier AG/CS (3 vues mois/semaine/liste, filtres, agenda latéral) - hexa mock complet
  - ✅ Supervision AG (5 sections × 34 items, Server Actions + `useOptimistic`, visa final) - renomme "Fiche prépa AG" du périmètre initial, scope élargi vers une vraie checklist de supervision
  - ✅ Mes événements (à traiter, AG à venir, copros sans AG) — mock hexa, route `/mes-evenements`
  - ✅ Fiche copro 360° light (vue d'ensemble, événements, historique AG) — **mini-map Leaflet et tantièmes retirés** (ADR-013 déprécié) ; CS/historique AG/conformité = blocs sourcés eStale, mockés en attendant J4
- 🔲 Découpage Server / Client Components documenté dans `docs/component-strategy.md`
- 🔲 Tests E2E (Playwright) sur le parcours golden

**Livrable démontrable** : "un gestionnaire peut naviguer dans toute l'app avec des données fictives, voir ses jalons, marquer des actions comme accomplies."

---

## J3 - Branchement SharePoint (semaines 5-6)

Remplacement progressif du `MockCoproAdapter` par le vrai sur les copros source SharePoint.

⏸️ **Dépendance** : J1b livré + sites SharePoint allowlistés par DSI.

- 🔲 Client Graph API robuste (`lib/adapters/sharepoint/graph-client.ts`) :
  - Auth client_credentials
  - Retry + backoff exponentiel + jitter
  - Respect throttling (`Retry-After`)
  - Pagination (> 10k items)
- 🔲 `SharePointCoproAdapter`, `SharePointEvenementAdapter` (lecture seule)
- 🔲 Mappers SharePoint -> Domain documentés (cf. `docs/sharepoint-inventory.md`)
- 🔲 Tables miroir Supabase (`mirror_copros`, `mirror_evenements`...)
- 🔲 Job `sync-sharepoint-nightly` (Vercel Cron, 3h du matin)
- 🔲 **Géocodage Nominatim** intégré au sync (cf. ADR-013)
- 🔲 Page admin `/admin/jobs` avec runs récents
- 🔲 Alerting : pas de sync depuis 36h -> mail manager
- 🔲 Bouton "rafraîchir cette copro" -> sync ciblé

**Livrable démontrable** : "les gestionnaires voient leurs vraies copros REAL31, à jour de la veille, avec mini-map fonctionnelle."

---

## J4 - Branchement eStale (semaines 7-8)

Mêmes pages, mais pour les 4 copros pilotes eStale.

- 🔲 Setup compte de service eStale (cf. ADR-005)
- 🔲 Client GraphQL eStale (`lib/adapters/estale/graphql-client.ts`) :
  - Auth session cookie + relogin paresseux sur 401
  - Rate limit interne à 50 req/s (vérifié par introspection du schéma, cf. ADR-002/ADR-022)
- 🔲 Codegen GraphQL (graphql-codegen) basé sur `docs/estale-schema.json`
- 🔲 `EstaleCoproAdapter`, `EstaleEvenementAdapter`
- 🔲 Routeur d'adapters (`lib/adapters/router.ts`) lisant `copros.source`
- 🔲 Job `refresh-estale-stale-entries` (Vercel Cron horaire)
- 🔲 Tests de bascule : marquer une copro `source = 'estale'`, vérifier que le job SharePoint l'ignore
- 🔲 Page admin "bascule source"
- 🔲 Badge `Source : Crypto/eStale` + bouton "Ouvrir dans eStale" (cf. ADR-003, ADR-012)

**Livrable démontrable** : "les 4 copros eStale apparaissent à côté des 164 SharePoint, indistinctement pour l'UI."

**Critère de sortie de J4** : aucune fuite SharePoint/eStale dans les Server Components. L'ESLint d'isolation tourne sans erreur.

---

## J5 - Alertes, mails, automatisations, audit complet (semaines 9-11)

Passage de "consultatif" à "proactif".

- 🔲 Introduction d'**Inngest** (cf. ADR-004)
- 🔲 Microsoft Graph `Mail.Send` configuré (Application Access Policy sur boîte service)
- 🔲 Alertes mail :
  - Jalons AG en retard (ambre + rouge)
  - Copros sans AG planifiée depuis > 11 mois
  - Synthèse hebdo manager (lundi 8h)
- 🔲 Templates mail (probable `react-email`)
- 🔲 Audit log enrichi : couverture lectures sensibles (niveau b - ADR-007)
- 🔲 Tests E2E enrichis : trigger d'alerte -> mail dans boîte de test

**Livrable démontrable** : "le manager reçoit la synthèse hebdo lundi matin, plus alertes ambre/rouge."

---

## J6 - Pré-prod, RGPD, go-live (semaine 12)

Stabilisation, paperasse, lancement.

- 🔲 Tests utilisateur intensifs avec les gestionnaires (≥ 3 sessions guidées)
- 🔲 Documentation utilisateur (Notion ou markdown dans `docs/user-guide/`)
- 🔲 Documentation admin (variables d'env, runbooks)
- 🔲 Page "Mentions légales" + "Politique RGPD" (avec exercice des droits)
- 🔲 Politique de purge `audit_log` (cron au-delà de la durée de conservation)
- 🔲 Sentry intégré (erreurs serveur + client)
- 🔲 Vercel Analytics activé
- 🔲 Domaine custom (`intranet.real31.fr` ou équivalent)
- 🔲 Sauvegardes Supabase vérifiées (PITR activé)
- 🔲 Runbook incident dans `docs/runbook.md`

**Livrable démontrable** : "go-live MVP, les gestionnaires utilisent l'intranet quotidiennement."

---

## Vision produit élargie et phasage

> Section **informative** (cible décidée le 2026-05-27, cf. ADR-021). Rien des modules
> post-MVP ne doit être anticipé dans le code tant que le MVP n'est pas livré. Le
> périmètre de dev actif reste les 5 écrans (J0 à J6 ci-dessus).

L'intranet REAL31 devient la **porte d'entrée unique** du cabinet, à terme 8 modules.
Phasage en 4 temps.

### 1. MVP (strict, en cours)

Les 5 premiers écrans du mockup, rien de plus. Exécution détaillée : J0 à J6 ci-dessus.

1. Dashboard
2. Calendrier AG/CS
3. Mes événements (version simple, sans gestion des mails)
4. Fiche prépa AG
5. Fiche copro 360°

Aucun module 6/7/8 ni feature post-MVP dans ce périmètre.

### 2. Post-MVP vague 1 (à intégrer juste après le MVP)

- **Module 7 - Contrats** (syndic-cabinet + fournisseurs) **si** le patron valide de le
  développer dans l'intranet plutôt qu'en standalone (décision en attente, cf. ADR-021).
  Inclut le registre des contrats fournisseurs et les alertes d'échéance J-90/60/30.
- **Extension des rôles et scopes** : `assistant`, `comptable`, `directeur`, `dirigeant`
  (cf. ADR-009). Pas de nouveaux écrans, juste ajout de policies RLS et page admin
  enrichie (`reports_to_user_id`).
- Alertes et synthèses enrichies (suite de J5).

### 3. Post-MVP vague 2 (plus lointain)

- **Module 8 - Registre des mandats** : absorption de l'app A (RegistreMandats, en prod).
  Port des intégrations OneSpan, Azure Document Intelligence et scan-email sous forme
  d'**adapters** hexagonaux (cf. ADR-021, ADR-001).
- **Module 6 - Divers syndic** : numérisation des Excel quotidiens (badges Intratone,
  archives physiques, etc.).
- **Génération de documents PDF** : convocations AG (LRAR + voie électronique), ODJ
  formaté, note immeuble, courriers types (rouvrir ADR-012).
- **Intelligence** : détection d'anomalies (soldes négatifs, contrats orphelins), vues
  matérialisées Supabase pour les agrégations lourdes.
- **Migration finale eStale** : quand 100 % des copros sont sur eStale, décommissionner
  `SharePointCoproAdapter`, traiter le sort des données historiques (ADR-018), retirer
  les tables `mirror_*`.
- **Serveur MCP** : exposition de l'API métier (prérequis déjà posé par les ports d'ADR-001).

### 4. Vision long terme - les 8 modules

L'intranet comme porte d'entrée unique du cabinet :

1. Dashboard
2. Calendrier AG/CS
3. Mes événements (peut-être gestion des mails plus tard)
4. Fiche prépa AG
5. Fiche copro 360°
6. Divers syndic (badges, archives, Excel quotidiens)
7. Contrats (syndic-cabinet + fournisseurs)
8. Registre des mandats (app A absorbée)

### Stratégie de transition (cf. ADR-021)

- Coexistence assumée de l'app A et de l'intranet pendant **~5 à 7 mois**. Pas de big bang.
- L'app A reste en prod et sert l'équipe pendant toute la transition.
- L'archi hexagonale de l'intranet reste **l'autorité de qualité**.
- Prisma (hérité de A) **cohabite** avec supabase-js le temps de la transition : dette
  technique assumée et bornée, à résorber selon ADR-015.

---

## Risques et mitigations (vivant)

| Risque | Statut | Mitigation |
|---|---|---|
| ⚠️ Lenteur DSI sur Entra ID | Actif J0 | J1a parallèle (mock auth), J1b déblocable rapidement après livraison |
| Migration eStale retardée | Surveillé | ADR-005 prévoit la transition |
| Mauvais calcul jalon AG | Surveillé | Tests exhaustifs ADR-006, revue juridique avant prod |
| Session eStale instable | Accepté | Refresh paresseux, attente API key |
| Sync SharePoint cassé | Surveillé | Watermarks + alerting J3 |
| Scope creep | À discipline | ADR-008 (périmètre coordination), refus poli systématique |
| Qualité géocodage Nominatim | Surveillé | Critère 5 % erreur -> migration BAN/MapBox (ADR-013) |
| Frustration boutons PDF grisés | Faible | Tooltip explicite + promesse vague 2 |

---

## Décisions ouvertes / questions en attente

Cf. `DECISIONS.md` -> "Décisions futures à formaliser" (ADR-014 à 020) :
- UI library (à figer pendant J1a/J2 selon le mockup et le confort)
- ORM Supabase (à figer pendant J1a - increment 2)
- Validation runtime (J1a - increment 2)
- Auth library (J1b)
- Sort des données SharePoint post-migration
- Stratégie tests
- Observabilité

Chaque décision = ADR au moment où elle est tranchée.
