# ROADMAP.md - REAL31 Intranet

Roadmap macro jusqu'à la mise en production du MVP, puis aperçu post-MVP.

> **Convention** : ce fichier est la mémoire institutionnelle inter-sessions / inter-machines (Mac/PC). À lire en premier en début de session, à mettre à jour à chaque fin d'incrément ou de session significative.

---

## 📍 État actuel - 2026-05-26

- **Phase** : J1a - Fondations techniques, Increment 2 (Supabase + schéma initial)
- **Branche Git active** : `increment/02-supabase` (à jour avec `origin`)
- **Dernier incrément terminé** : ✅ Increment 1 - Bootstrap (mergé via `increment/01-bootstrap`)
- **Incrément en cours** : 🔄 Increment 2 - Supabase + schéma initial
  - ✅ Supabase CLI installé + scaffold du projet local (commit 20302fa)
  - ✅ Première migration : schéma initial complet sans RLS (commit 3d7f67c)
  - 🔲 Projet Supabase cloud EU créé + branché
  - 🔲 Variables d'env Vercel + `.env.local` documentées
  - 🔲 Client Supabase typé (codegen depuis le schéma)
- **Bloqueurs / en attente** :
  - ⏸️ **Mutualisation Supabase patron** : décision en attente du retour mail du dirigeant. Cf. memory projet `project_supabase_mutualisation.md`. Tant que pas validé : on ne crée **pas** de projet Supabase Cloud autonome, et on gèle code/migration côté cloud (le scaffold local Supabase CLI peut continuer).
  - ⚠️ **Demande Entra ID App Registration au DSI** (J0) : à déclencher si pas encore fait - bloquant pour J1b.
- **Prochaine action concrète** : trancher la mutualisation Supabase (réponse patron) → soit créer projet REAL31 dédié dans son org, soit créer un nouveau projet EU REAL31 autonome ; ensuite continuer Increment 2 (codegen client typé + brancher l'app sur la BDD).

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
- **Surcouche de coordination eStale**, pas un logiciel métier (cf. ADR-008).
- **Modules MVP** : Planification CS/AG + Fiche copro 360° light + alertes basiques.
- **5 écrans** (cf. mockup) : Dashboard, Calendrier, Mes événements, Fiche prépa AG, Fiche copro 360°.
- **Hors MVP explicite** : génération PDF, contrats détaillés, sinistres, compta, modules logistique.

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
- 🔲 5 écrans Next.js fidèles au mockup :
  - Dashboard (stats, alertes, prochains événements, équipe)
  - Calendrier (vue liste + vue grille jours×mois, filtres)
  - Mes événements (à traiter, AG à venir, copros sans AG)
  - Fiche prépa AG (timeline jalons, ODJ, historique actions)
  - Fiche copro 360° light (vue d'ensemble, événements, historique AG, mini-map Leaflet)
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
  - Rate limit interne à 30 req/s
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

## Post-MVP - Vagues suivantes (J7+)

À cadrer plus précisément quand le MVP sera stable.

### Vague 1 : extension des rôles (~1 mois)
- Activation des scopes `assistant`, `comptable`, `directeur`, `dirigeant` (cf. ADR-009)
- Pas de nouveaux écrans, juste ajout de policies RLS
- Page admin enrichie pour gérer les `reports_to_user_id` (assistants)

### Vague 2 : génération de documents (~2-3 mois)
- ADR sur la stratégie PDF (rouvrir ADR-012)
- Convocations AG (LRAR + voie électronique)
- ODJ formaté
- Note immeuble
- Courriers types (mise en demeure, relance impayés)

### Vague 3 : contrats fournisseurs (~1 mois)
- Registre des contrats (ascenseur, chaufferie, etc.)
- Alertes échéances J-90/60/30

### Vague 4 : intelligence et autres modules (~variable)
- Détection d'anomalies (soldes négatifs, contrats orphelins)
- Logistique (badges Intratone, archives physiques)
- Vues matérialisées Supabase pour les agrégations lourdes

### Vague 5 : MCP server (à dater)
- Exposition de l'API métier via MCP
- Prérequis : Ports propres (déjà fait par ADR-001)

### Migration finale eStale
- Quand 100 % des copros sont sur eStale : décommissionner `SharePointCoproAdapter`
- ADR-018 (sort des données historiques SharePoint)
- Retirer les tables `mirror_*` héritées

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
