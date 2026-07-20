# DECISIONS.md - Architectural Decision Records

Ce document trace les décisions d'architecture significatives du projet
**REAL31 Intranet**. Chaque entrée suit un format ADR léger : **contexte ->
décision -> conséquences**. Une décision n'est pas figée pour l'éternité - si
on la révise, on **ajoute** un nouvel ADR qui supersede l'ancien. Pour les
révisions mineures (enrichissement à la lumière de nouveaux faits), on
met à jour l'ADR existant et on incrémente la version dans son entête.

**Légende statut** : Proposed · Accepted · Deprecated · Superseded by ADR-XXX

---

## Index

| #       | Titre                                                                                     | Statut                | Version | Date       |
| ------- | ----------------------------------------------------------------------------------------- | --------------------- | ------- | ---------- |
| ADR-001 | Pattern d'abstraction des sources de données (Ports & Adapters)                           | Accepted              | v2      | 2026-05-22 |
| ADR-002 | Stratégie de cache et fraîcheur des données                                               | Accepted              | v3      | 2026-05-22 |
| ADR-003 | Migration progressive SharePoint -> eStale                                                | Accepted              | v2      | 2026-05-22 |
| ADR-004 | Jobs, cron et orchestration                                                               | Accepted              | v1      | 2026-05-22 |
| ADR-005 | Authentification eStale et transition vers API key                                        | Accepted              | v2      | 2026-05-22 |
| ADR-006 | Système de jalons à deux étages (légal + REAL31)                                          | Accepted              | v2      | 2026-05-22 |
| ADR-007 | Audit RGPD niveau (b) + séparation audit/activity log                                     | Accepted              | v2      | 2026-05-22 |
| ADR-008 | Périmètre fonctionnel - surcouche de coordination eStale                                  | Superseded by ADR-021 | v1      | 2026-05-22 |
| ADR-009 | Permissions et scopes - gestionnaire cloisonné au MVP, modèle extensible                  | Accepted              | v1      | 2026-05-22 |
| ADR-010 | Identification utilisateurs - mapping initiales Crypto ↔ email Entra ID                   | Accepted              | v1      | 2026-05-22 |
| ADR-011 | RLS Supabase activée dès J1, complexification par ajout de policies                       | Accepted              | v1      | 2026-05-22 |
| ADR-012 | Génération PDF reportée post-MVP + retrait du deep-link Crypto                            | Accepted              | v1      | 2026-05-22 |
| ADR-013 | Géocodage des adresses via Nominatim OSM dans le job de sync                              | Deprecated (MVP)      | v3      | 2026-06-09 |
| ADR-021 | Plateforme REAL31 unifiée - absorber l'app A, MVP strict, cohabitation Prisma/supabase-js | Accepted              | v1      | 2026-05-27 |
| ADR-022 | Positionnement intranet vis-à-vis d'eStale et stratégie d'intégration défensive           | Accepted              | v1      | 2026-05-27 |

---

## ADR-001 - Pattern d'abstraction des sources de données

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : enrichissement de la liste des types métier suite à analyse du mockup. Pas de changement structurel.

### Contexte

Pendant un minimum de 6 mois, l'application doit lire **trois sources hétérogènes en parallèle** :

1. **SharePoint** (Microsoft Graph API) - 164 copros, données exportées manuellement depuis Crypto/Septeo.
2. **eStale** (GraphQL) - 4 copros pilotes au démarrage, 168 à terme.
3. **Supabase** - données métier natives à l'intranet (jalons, alertes, notes, audit logs, présences pré-AG, historique d'actions, conformité...).

À terme, eStale deviendra la seule source externe. **L'architecture doit pouvoir débrancher SharePoint sans toucher aux pages, composants, ou règles métier.**

Le piège à éviter : un `getCopros()` global qui contiendrait des `if (source === 'estale')` éparpillés. Code qui pourrit, migration douloureuse, fuites de l'API SharePoint dans les composants React.

### Décision

On adopte une **architecture hexagonale (Ports & Adapters)**, version pragmatique. Trois couches strictes :

1. **Domaine** (`lib/domain/`) - Types TypeScript purs, zéro dépendance technique. Les règles métier (décret 1967, calcul des jalons) vivent ici.

2. **Ports** (`lib/ports/`) - Interfaces TypeScript : `CoproRepository`, `EvenementRepository`, `JalonRepository`, etc. Le code applicatif ne connaît **que ça**.

3. **Adapters** (`lib/adapters/`) - Implémentations concrètes :
   
   - `lib/adapters/sharepoint/` - utilise Microsoft Graph
   
   - `lib/adapters/estale/` - utilise le client GraphQL
   
   - `lib/adapters/supabase/` - utilise supabase-js
   
   - `lib/adapters/mock/` - pour développement local et tests

Un **routeur** (`lib/adapters/router.ts`) instancie le bon adapter selon le champ `copros.source` en base. Le routage est par-entité, pas global.

### Types métier (recensement complet post-mockup)

Données provenant des sources externes (SharePoint ou eStale) :

- `Copropriete` - référentiel copros (code, nom, adresse, gestionnaire, lots, tantièmes...)
- `Evenement` - type discriminé : `AG | AGE | CS | Visite | Travaux`. Sourcé externe pour la définition de base (date, lieu, copro).

Données **natives à l'intranet** (Supabase uniquement) :

- `Jalon` - lié à un événement de type AG/AGE. Champs : `type`, `cible_date`, `realise_date`, `statut ∈ {a_faire, accompli, en_alerte}`, `commentaire`, `marque_par_user_id`. Le jalon **n'existe pas** dans Crypto/eStale.
- `ItemODJ` - item d'ordre du jour d'une AG. Champs : `ordre`, `libelle`, `regle_majorite ∈ {art24, art25, art26, unanimite, sans_vote}`.
- `ConformiteCopropriete` - calcul de la fiche conformité : `ag_a_jour`, `pas_de_retard_legal`. Pour le MVP, seul `ag_a_jour` est calculé (cf. ADR-008).
- `MembreConseilSyndical` - nom, rôle (`president | membre`), date de fin de mandat. Saisie manuelle.
- `PresencePreAG` - compteurs avant l'AG : `presents_prevus`, `pouvoirs_recus`, `votes_correspondance_recus`, `total_lots`. Saisie manuelle.
- `HistoriqueAction` - "FS a marqué X comme accompli". Écrit dans `activity_log` (cf. ADR-007).
- `Alerte` - alerte calculée et son état de traitement (lue/résolue par qui, quand).
- `User`, `GestionnaireMapping` - identité et permissions (cf. ADR-009, ADR-010).

### Conséquences

**Positives**

- Migration eStale = supprimer `SharePointCoproAdapter` + retirer la valeur `'sharepoint'` de l'enum `source`. Zéro impact UI.
- Tests : on injecte `MockCoproAdapter` partout, plus besoin de mocker `fetch` ou Graph SDK.
- L'abstraction reste utile **même sans eStale** (mocks, séparation propre, testabilité).

**Négatives**

- Boilerplate au démarrage (interfaces + 4 adapters).
- Tentation de fuites : il faut être **discipliné**.

**Règle d'or non négociable** : aucun import direct de `@microsoft/microsoft-graph-client`, `graphql-request`, ou `@supabase/supabase-js` en dehors des sous-dossiers `lib/adapters/<source>/`. Cette règle est **lintable** via une règle ESLint (boundaries plugin ou règle custom). À mettre en place dans J1a - increment 1.

**Structure cible** :

```
src/
  app/                    # Routes Next.js, Server/Client Components
  lib/
    domain/               # Types et règles métier purs
      copropriete.ts
      evenement.ts
      jalons-ag/
    ports/                # Interfaces (contrats)
    adapters/
      sharepoint/         # Graph API uniquement ici
      estale/             # GraphQL uniquement ici
      supabase/           # supabase-js uniquement ici
      mock/               # Données fictives
      router.ts           # Sélectionne l'adapter selon copros.source
    services/             # Logique applicative
    jobs/                 # Jobs cron, fonctions appelables aussi en CLI
    audit/                # withAudit() et activity_log helpers
    auth/                 # Mock auth (J1a) puis Entra ID (J1b)
```

### Foreign keys et entités natives sur événements externes

Subtilité importante : un `Jalon` (natif) référence un `Evenement` (qui peut être sourcé SharePoint ou eStale). On adopte un schéma unifié :

```sql
-- table unique pour tous les événements
create table evenements (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sharepoint','estale','native')),
  source_id text,                  -- null si source='native'
  copro_id uuid references copros(id),
  type text not null,              -- AG, AGE, CS, Visite, Travaux
  date timestamptz not null,
  -- autres colonnes communes
  archived_at timestamptz,         -- soft delete (jamais hard delete)
  unique (source, source_id)
);

-- jalons natifs référencent evenements.id (UUID local)
create table jalons (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references evenements(id),
  type text not null,
  -- ...
);
```

Le job de sync upsert dans `evenements` (`source != 'native'`). Soft delete via `archived_at` pour ne jamais casser une FK depuis `jalons`. La compaction physique éventuelle est un problème post-MVP.

---

## ADR-002 - Stratégie de cache et fraîcheur des données

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v3

> v3 : rate limit eStale corrigé de 30 à 50 req/s, valeur vérifiée par introspection du schéma réel (cf. ADR-022).
> 
> v2 : clarification explicite "données natives intranet jamais répliquées vers les sources externes". Renforcement de la règle après confirmation par le mockup que toutes les écritures UI concernent du natif.

### Contexte

Trois sources avec des caractéristiques très différentes :

- **SharePoint** : données déjà J-X (export manuel Crypto). Throttling Graph API par tenant. Aucun webhook fiable.
- **eStale** : API GraphQL conçue pour de la lecture live. Rate limit 50 req/s (vérifié par introspection, cf. ADR-022). Session cookie (cf. ADR-005).
- **Supabase** : low latency, requêtes SQL puissantes, on en est propriétaire.

Question : où lit-on, et avec quelle fraîcheur ?

### Décision

**Toutes les pages de l'UI lisent exclusivement Supabase.** Les adapters externes (SharePoint, eStale) ne sont appelés **que par les jobs de synchronisation**, jamais par les requêtes utilisateur.

**Stratégies différenciées par source** :

- **SharePoint -> sync miroir nocturne** dans des tables Supabase miroir.  
  Justification : les données sources sont elles-mêmes J-X, lire live n'apporte aucune fraîcheur réelle. Le sync apporte de la résilience aux pannes Graph et la puissance des joins SQL.

- **eStale -> read-through cache à TTL court** dans Supabase.  
  Justification : eStale offre du live, mais en serverless l'orchestration session cookie à chaque requête est coûteuse. Un cache court (15 min pour données chaudes, 24h pour le référentiel) donne la quasi-fraîcheur sans le coût.

**Bouton "rafraîchir maintenant"** sur les pages où la fraîcheur est critique (fiche prépa AG notamment). Déclenche un sync ciblé immédiat pour la copro concernée.

### Règle de non-réplication vers l'externe (renforcée v2)

**Les données natives intranet (jalons, ItemODJ, conformité, présences, historique, alertes) ne sont jamais répliquées vers Crypto ou eStale.** Elles vivent uniquement dans Supabase.

Pour les modifications profondes côté source (lots, tantièmes, gestionnaire assigné, mouvements compta) : l'UI propose un bouton **"Ouvrir dans [source]"** qui est un **deep-link** vers le logiciel métier. L'intranet n'écrit jamais dans la source.

Cette règle simplifie radicalement l'architecture :

- Pas de gestion de conflit bidirectionnel
- Pas de write-through complexe vers les sources
- Pas de file d'attente de sync sortant
- Les sources restent autoritatives pour leur périmètre

**Conséquence sur les deep-links** : ils dépendent du logiciel. Pour Crypto, **retirés** car Crypto est un legacy desktop non deep-linkable (cf. ADR-012). Pour eStale, URL pattern stocké en variable d'environnement.

### Conséquences

**Positives**

- **Un seul chemin de lecture pour l'UI** = simplicité maximale, performance prédictible, mocks triviaux.
- Les pannes Graph ou eStale ne cassent pas l'app, juste la fraîcheur.
- Tests E2E ne dépendent pas de la disponibilité des APIs externes.
- Pas de risque de corruption de la source par bug d'intranet.

**Négatives**

- Données potentiellement décalées (max 24h SharePoint, 15min-24h eStale).
- Complexité du job de sync (idempotence, watermarks, gestion d'erreurs).
- Risque de désync silencieuse -> mitigé par alerting (cf. ADR-004).

### Détails d'implémentation à valider en J3

- Tables miroir Supabase : préfixées `mirror_` (`mirror_copros`, ...) pour distinguer des tables natives.
- Chaque ligne miroir porte : `source`, `source_id`, `synced_at`, `etag` ou `last_modified` pour delta sync.
- Job SharePoint = **upsert** par `(source, source_id)`. Soft delete via `archived_at`.

---

## ADR-003 - Migration progressive SharePoint -> eStale

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : ajout des conséquences UI (badge "Source : X" affiché + routage du bouton "Ouvrir dans X" selon source).

### Contexte

Aujourd'hui 4 copros sur eStale, 164 sur SharePoint. Dans 6 mois (estimé), 168 sur eStale. Transition **progressive**, copro par copro.

### Décision

**Discriminateur unique** : champ `source: 'sharepoint' | 'estale'` sur `copros`. Le routeur d'adapters (ADR-001) lit ce champ et délègue.

**Process de bascule d'une copro** :

1. État initial : `copros.source = 'sharepoint'`. Job SharePoint la maintient.
2. **Action admin** (page dédiée) : passage à `source = 'estale'`. À partir de là :
   
   - Job SharePoint l'**ignore** lors du prochain run.
   
   - Job eStale la prend en charge.
3. **Pas de double-écriture, pas de merge.** Bascule sec et unidirectionnelle.

**Démarrer la migration dès qu'on a 10-15 copros sur eStale**, pas attendre les 168.

### Conséquences UI (nouveau v2)

Le mockup affiche un **badge `Source : Crypto`** (à terme `Source : eStale`) sur la fiche copro. Implications :

- L'UI doit savoir afficher ce badge -> exposer `copros.source` via le repository.
- Le bouton **"Ouvrir dans X"** est conditionnel : si `source = 'estale'`, on construit l'URL `{ESTALE_DEEPLINK_BASE}/copro/{source_id}`. Si `source = 'sharepoint'` (alias "Crypto" côté UI), le bouton est **absent** car Crypto n'est pas deep-linkable (cf. ADR-012).
- Nomenclature UI : `'sharepoint'` côté technique -> affiché `Crypto` côté utilisateur (c'est la source perçue par eux). `'estale'` -> `eStale`.

### Conséquences techniques

**Positives**

- Migration testable copro par copro.
- Si une copro eStale pose problème, on la repasse `source = 'sharepoint'` en un click.
- Audit trail clair via `audit_log`.

**Négatives**

- Possible incohérence transitoire après bascule. Mitigation : le job SharePoint **vérifie `source` au moment du run**, pas au moment de la planification.

### Question ouverte

Sort des données SharePoint quand la migration sera totalement terminée - suppression / archivage / conservation. À trancher dans un futur ADR avant la fin de la migration.

---

## ADR-004 - Jobs, cron et orchestration

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Plusieurs besoins d'exécution en arrière-plan :

- Sync nocturne SharePoint (~164 copros)
- Sync incrémental eStale (read-through cache)
- Alertes mail (J-90, J-60, J-30 sur contrats ; jalons AG en retard ; synthèse hebdo) - post-MVP
- Détection d'anomalies (post-MVP)

**Vercel = serverless = stateless**, pas de scheduler en mémoire.

### Décision

**Phase MVP (J1-J4) - Vercel Cron uniquement.**

- 1 cron `sync-sharepoint-nightly` (3h du matin)
- 1 cron `refresh-estale-stale-entries` (toutes les heures)

**Phase Alertes (J5) - Introduction d'Inngest** pour workflows durables, retry, idempotence, dashboard.

### Principe transversal : jobs portables

Tous les jobs sont des **fonctions TypeScript pures**, appelables :

1. Via Vercel Cron (handler API route)
2. Via Inngest (function declaration) - phase 2
3. **Via CLI** (`pnpm sync:sharepoint`) - critique pour dev local et debug prod.

```ts
// lib/jobs/sync-sharepoint.ts
export async function syncSharepoint(opts: { coproIds?: string[] }) { ... }

// app/api/cron/sync-sharepoint/route.ts
export const GET = withCronAuth(async () => syncSharepoint({}));

// scripts/sync-sharepoint.ts
syncSharepoint({ coproIds: process.argv.slice(2) });
```

### Observabilité (dès J1)

- Table `job_runs` Supabase : `job_name`, `started_at`, `ended_at`, `status`, `error`, `metadata`.
- Page admin `/admin/jobs` listant les runs récents.
- Alerting : si un cron critique n'a pas tourné depuis 36h -> notification mail manager.

### Alternatives rejetées

- **Supabase `pg_cron`** : OK pour SQL pur, pas pour appels HTTP externes.
- **QStash** : bon, mais moins d'observabilité qu'Inngest pour workflows complexes.
- **GitHub Actions cron** : latence élevée, pas d'intégration avec le code de prod.

---

## ADR-005 - Authentification eStale et transition vers API key

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : le mécanisme de bascule cookie vers clé API est désormais porté par ADR-022 (sélection par présence de `ESTALE_API_KEY`, pattern `EstaleProvider`). Les détails opérationnels ci-dessous (compte de service, secrets chiffrés, refresh paresseux, règles de log) restent valables.

### Contexte

eStale expose une API GraphQL authentifiée par **session cookie utilisateur**, obtenue via login REST `/api/login`. Pas de permissions différenciées par utilisateur côté eStale.

**Information critique** : eStale prévoit une **API key** dans les 3 à 6 prochains mois. La session cookie sera alors abandonnée.

### Décision

**Phase actuelle (session cookie)** :

- **Compte de service unique** côté serveur.
- Credentials stockés **chiffrés dans Supabase Vault** (ou variable env Vercel chiffrée).
- Gestion de session **minimale** :
  - Une seule session active
  - Refresh paresseux : si une requête échoue 401, on relogue, on retry une fois.
  - Pas d'advisory lock, pas de pool, pas de pré-refresh planifié.
- Audit trail applicatif tenu **dans Supabase**.

**Transition future (clé API)** :

- Le pattern et la bascule sont portés par **ADR-022** : interface `EstaleProvider` dans `lib/ports/`, deux implémentations `EstaleCookieAdapter` et `EstaleApiKeyAdapter` dans `lib/adapters/estale/`.
- Bascule = **présence de la variable d'env `ESTALE_API_KEY`** (présente, on prend l'adapter clé API ; absente, on reste sur le cookie). Ceci remplace l'ancienne idée d'un flag `ESTALE_AUTH_METHOD`.
- Le code applicatif n'appelle que le port, jamais un client concret.

### Critère de réévaluation

Si l'API key n'est pas disponible à **2026-11-22**, rouvrir cet ADR.

### Sécurité

- Credentials eStale **jamais** côté navigateur.
- Logs : ne **jamais** logger le cookie ni le mot de passe.

---

## ADR-006 - Système de jalons à deux étages (légal + REAL31)

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : ajout du schéma complet de la table `jalons` confirmé par le mockup (commentaire libre, marqué par, etc.) et liste des 5 jalons MVP.

### Contexte

Deux niveaux de délais :

- **Délais légaux** (loi 1965, décret 1967) : intangibles, codifiés. Dépassement = **responsabilité civile du syndic**.
- **Délais REAL31** : plus stricts que la loi (marge), configurables, propres à REAL31.

### Décision

**Architecture de `lib/domain/jalons-ag/`** :

```
lib/domain/jalons-ag/
  legal/
    delais.ts          # Constantes en dur, citations articles
    delais.test.ts     # Tests exhaustifs
  cabinet/
    real31-defaults.ts # Valeurs par défaut REAL31
  calculator.ts        # Calcul final = max(légal, cabinet)
  types.ts
```

**Couche légale** : constantes TypeScript immutables, commentées avec références d'articles.

```ts
export const DELAIS_LEGAUX = {
  /** Convocation d'AG : 21 jours francs minimum. Art. 9 décret 67-223. */
  CONVOCATION_AG_JOURS: 21,
} as const;
```

**Couche cabinet** : table Supabase `cabinet_settings` (clé/valeur typée), avec defaults code comme fallback.

**Calculator** retourne :

```ts
interface JalonCalcule {
  date: Date;           // = max(légal, cabinet) effective
  dateCabinet: Date;
  dateLegale: Date;
  source: 'legal' | 'cabinet';
}
```

**UI / alertes** :

- Vert : avant la date REAL31
- Ambre : dépassement REAL31 mais dans le légal
- Rouge : dépassement légal -> alerte mail immédiate + entrée `audit_log` de niveau `LEGAL_VIOLATION`

### 5 jalons MVP (confirmés par mockup)

Pour une AG/AGE :
| Ordre | Jalon | Cible | Source |
|---|---|---|---|
| 1 | ODJ validé avec CS | J-45 | Cabinet REAL31 |
| 2 | Devis et documents techniques rassemblés | J-45 | Cabinet REAL31 |
| 3 | Convocations envoyées | J-21 | **Légal - art. 9 décret 1967** |
| 4 | Pouvoirs et votes par correspondance reçus | J-2 | Cabinet REAL31 (relance reco à J-5) |
| 5 | Tenue de l'AG | J-0 | **Légal** |

### Schéma de la table `jalons`

```sql
create table jalons (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references evenements(id),
  type text not null,                    -- code interne (ODJ_CS, DEVIS, CONVOC, POUVOIRS, TENUE)
  cible_date date not null,              -- calculée au moment de la création de l'AG
  realise_date date,
  statut text not null default 'a_faire',-- a_faire | accompli | en_alerte
  commentaire text,                      -- saisi à la main au marquage
  marque_par_user_id uuid references users(id),
  marque_at timestamptz,
  created_at timestamptz default now()
);
```

### Tests obligatoires (J2)

- Jours fériés français
- AG en plein mois d'août
- Année bissextile
- Calcul "jours francs" vs "jours calendaires" vs "jours ouvrés"
- Convocation envoyée vendredi 19h pour AG lundi suivant

### Note de responsabilité

Pas de validation juridique externe pour le MVP. **Revue juridique recommandée avant la mise en prod** si l'outil devient prescriptif (envoi automatique de convocations).

---

## ADR-007 - Audit RGPD niveau (b) + séparation audit / activity log

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : ajout de la séparation `audit_log` (RGPD) vs `activity_log` (UI feature). Validée après analyse du mockup qui montre un fil d'historique d'actions affiché à l'utilisateur.

### Contexte

Le projet manipule des **données personnelles de copropriétaires**. Un syndic peut être accusé de constituer un fichier illicite si les accès ne sont pas tracés.

Le mockup montre par ailleurs un **historique d'actions affiché dans l'UI** (« FS a marqué X comme accompli le 5 mai »). Cette feature produit est **distincte** de l'audit RGPD.

### Décision

**Deux tables distinctes**, deux usages distincts.

#### `audit_log` - conformité RGPD

```sql
create table audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,                    -- nullable pour actions système (cron)
  actor_role text not null,              -- 'gestionnaire', 'cron', 'admin', ...
  action text not null,                  -- 'copro.read.sensitive', 'jalon.update'
  resource_type text not null,
  resource_id text,
  metadata jsonb,
  ip_address inet,
  user_agent text
);
create index audit_log_occurred_at_idx on audit_log (occurred_at desc);
create index audit_log_actor_user_id_idx on audit_log (actor_user_id);
create index audit_log_resource_idx on audit_log (resource_type, resource_id);
```

- **Append-only** (politique RLS bloque update/delete)
- **Jamais user-facing** : pas de SELECT depuis l'app utilisateur. Lecture admin uniquement (page admin `/admin/audit`)
- Niveau (b) : modifs + lectures de données sensibles (coordonnées, finances)
- Conservation 1-3 ans (à valider avec DPO)
- Purge automatique au-delà

#### `activity_log` - feature produit (historique affiché)

```sql
create table activity_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid not null references users(id),
  resource_type text not null,           -- 'evenement', 'jalon', 'copro'
  resource_id uuid not null,
  action_code text not null,             -- 'jalon.marked_done', 'event.date_set'
  payload jsonb,                         -- détails sérialisés pour reconstitution UI
  created_at timestamptz default now()
);
create index activity_log_resource_idx on activity_log (resource_type, resource_id, occurred_at desc);
create index activity_log_actor_idx on activity_log (actor_user_id, occurred_at desc);
```

- **Lecture user-facing** : requêté par les pages "Fiche prépa AG -> Historique des actions", "Mes événements -> Activité récente"
- Soumis à RLS (un gestionnaire ne voit que l'activité sur ses copros)
- Pas de purge automatique au début

### Mécanisme de capture (un seul point d'entrée)

Helper `withAudit()` wrappe les services métier. Selon le contexte, il écrit dans une table, l'autre, ou les deux.

```ts
// Pour une lecture sensible : audit_log uniquement
const copro = await withAudit({ action: 'copro.read.sensitive' }, () =>
  coproRepo.findByIdWithCoordinates(id)
);

// Pour une action métier user-meaningful : audit_log + activity_log
const jalon = await withAudit(
  { action: 'jalon.update' },
  () => jalonRepo.markDone(id, { commentaire }),
  { activity: { code: 'jalon.marked_done', payload: { jalon_type: '...' } } }
);
```

### Conséquences

**Positives**

- Audit RGPD propre, immuable, non pollué par les besoins UI.
- Historique UI requêtable efficacement (indexé par ressource).
- Un seul point d'entrée pour la capture = pas d'oubli, pas de double-écriture manuelle.

**Négatives**

- Deux tables au lieu d'une (mais leurs schémas divergent vite, c'est mieux séparé).
- Discipline d'équipe : toujours utiliser `withAudit()` pour les actions métier.

### Exclusions

- Mots de passe internes (Excel actuel) **non migrés** dans l'intranet. Hors scope, reco : Bitwarden / 1Password Business.
- Données bancaires (RIB copropriétaires) restent dans Crypto/eStale, **jamais persistées** côté intranet.

---

## ADR-008 - Périmètre fonctionnel : surcouche de coordination eStale

**Date** : 2026-05-22 · **Statut** : Superseded by ADR-021 · **Version** : v1

> Superseded by ADR-021 (plateforme unifiée, MVP strict comme nouveau garde-fou). Le cœur d'ADR-008 reste pertinent (ne pas redévelopper ce qu'eStale fait déjà), mais le positionnement "surcouche fine, pas un logiciel métier" est dépassé : l'intranet devient une plateforme à modules. La protection contre la dérive de périmètre n'est plus "rester fin" mais "MVP strict" (cf. ADR-021).

### Contexte

Question récurrente : "pourquoi pas de module compta dans l'intranet ?" "pourquoi pas de gestion locative ?" "pourquoi pas un registre complet des contrats avec montants ?"

Sans décision explicite, le scope dérivera mois après mois vers un logiciel métier complet, ce qui n'est ni le besoin, ni soutenable par une seule personne, ni cohérent avec l'investissement déjà fait dans eStale.

### Décision

**L'intranet REAL31 est une surcouche de coordination par-dessus eStale** (et Crypto pendant la transition de 6 mois). Ce n'est PAS un logiciel métier.

**Ce qui reste dans le logiciel métier (eStale/Crypto)** :

- Comptabilité (tous mouvements, soldes, RIB, écritures)
- Gestion locative
- Contrats détaillés (clauses, avenants, montants)
- Données réglementaires lourdes (DTG, PPT, diagnostics)
- Référentiel copros, lots, copropriétaires
- Génération des appels de fonds

**Ce que l'intranet apporte** :

1. **Planification CS/AG transverse** au cabinet (vue manager + vue gestionnaire)
2. **Suivi des jalons réglementaires** (échéances loi 1965 / décret 1967)
3. **Alertes et automatisations** (J-90 contrats, jalons en retard, synthèse hebdo)
4. **Génération de documents** (note immeuble, ODJ, convocations, courriers) - post-MVP
5. **Vue centralisée** pour coordonner l'équipe (qui fait quoi, où on en est)
6. **Mémoire institutionnelle** (notes libres, historique d'actions)

### Conséquences

**Positives**

- Périmètre tenable par 1 dev sur plusieurs mois sans burn-out.
- Pas de redondance fonctionnelle avec eStale (qui le fait déjà mieux pour le métier).
- Investissement de REAL31 dans eStale préservé.
- L'intranet reste fin et focalisé, donc maintenable des années.

**Négatives**

- L'utilisateur a deux outils ouverts : l'intranet (coordination) + eStale (métier).
- Risque de demande de duplication ("affiche-moi le solde compta ici aussi") - à refuser sauf cas marginal.

**Règle de gouvernance** : toute proposition de feature qui dupliquerait une fonctionnalité existant dans eStale doit déclencher la question : *"pourquoi ne pas le faire dans eStale ?"*. Réponse acceptable uniquement si la valeur ajoutée est dans la **coordination ou la transversalité** (ex. comparer le solde de 10 copros d'un coup -> c'est de la coordination, ça peut entrer).

### Conséquence sur les profils utilisateurs

Il n'y a **pas 6 écrans différents pour 6 rôles métier**. Il y a **une seule UI** (la vue gestionnaire du mockup), avec des **périmètres de visibilité** différents selon le rôle. Cf. ADR-009.

---

## ADR-009 - Permissions et scopes : gestionnaire cloisonné au MVP, modèle extensible

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

MVP : 4-7 gestionnaires, chacun voit uniquement ses copros (cloisonnement strict).

Vision long terme :

- Dirigeant, directeurs syndic -> voient toutes les copros (ou celles de leur direction)
- Comptables -> voient toutes les copros (pour coordination avec gestionnaires)
- Assistants -> voient les copros de leur gestionnaire référent
- Collègues d'autres services -> accès lecture selon besoin

**L'UI reste la même.** Seul le **périmètre de filtrage** change.

### Décision

**Modèle de données prêt pour tous les rôles dès J1, mais seul le scope `gestionnaire` est activé.**

#### Schéma `users`

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,            -- email Entra ID
  display_name text not null,
  role text not null check (role in (
    'gestionnaire',
    'assistant',
    'comptable',
    'directeur',
    'dirigeant',
    'admin'
  )),
  -- attribut métier : pour 'gestionnaire' et 'assistant', leurs initiales Crypto
  gestionnaire_initials text,            -- ex 'FS', 'KN', 'OR', 'SC'
  -- pour 'assistant' : référence au gestionnaire dont il dépend (post-MVP)
  reports_to_user_id uuid references users(id),
  is_active boolean default true,
  created_at timestamptz default now()
);
```

#### Concept de scope

Chaque rôle a un **scope** qui définit quelles copros il voit. Trois scopes possibles à terme :

| Rôle                                  | Scope                        | Implémentation                                               |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `gestionnaire`                        | "mes copros"                 | `copros.gestionnaire_initials = users.gestionnaire_initials` |
| `assistant`                           | "copros de mon gestionnaire" | via `reports_to_user_id` (post-MVP)                          |
| `comptable`, `directeur`, `dirigeant` | "toutes les copros"          | pas de filtre                                                |
| `admin`                               | "toutes + admin"             | pas de filtre + accès aux pages admin                        |

**Au MVP, seul le scope `gestionnaire` est activé.** Les autres rôles existent dans l'enum mais aucune politique RLS ne leur donne accès -> en pratique ils ne voient rien tant qu'on n'ajoute pas la policy correspondante.

### Conséquences

**Positives**

- Extensibilité par **ajout** de policies RLS, pas par refonte (cf. ADR-011).
- L'UI ne change pas selon le rôle, juste les données retournées.
- Audit log inclut déjà `actor_role` -> traçabilité dès J1, utile post-MVP.

**Négatives**

- Plus de colonnes "inutilisées" au MVP (`reports_to_user_id`, autres rôles).
- Tentation de coder des features par rôle plus tôt - à refuser.

### Anti-pattern à éviter

**Ne PAS** coder un système de permissions custom dans l'app (genre `if user.role === 'gestionnaire' && copro.gestionnaire === user.initials`). Toute la logique de scope passe par RLS Supabase (cf. ADR-011). L'app fait confiance aux requêtes - si Supabase ne retourne pas une ligne, c'est qu'on n'y a pas droit.

---

## ADR-010 - Identification utilisateurs : mapping initiales Crypto ↔ email Entra ID

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Les exports Crypto identifient le gestionnaire d'une copro par **initiales** (ex. `FS`, `KN`). L'authentification se fait via **Entra ID** qui retourne un **email** (`francois.sergent@real31.fr`).

Il faut une correspondance entre les deux.

### Décision

**Table de mapping native Supabase**, saisie une fois à la main par un admin.

Cette table n'est pas une entité séparée - c'est le champ `users.gestionnaire_initials` introduit dans ADR-009. Le mapping est porté directement par la table `users`.

#### Process de bootstrap

1. Le job de sync SharePoint extrait la liste d'**initiales uniques** vues sur le terrain (colonne `Gestionnaire`).
2. La liste est exposée sur une page admin `/admin/users` avec :
   
   - Les initiales connues côté SharePoint
   
   - Les users existants côté `users`
   
   - Les initiales non encore mappées (orphelines)
3. L'admin crée manuellement le user (`email Entra ID` + `display_name` + `gestionnaire_initials`).

#### Process au login

1. User se connecte via Entra ID -> token avec email.
2. App cherche `users.email = <email>` :
   
   - Trouvé et `is_active = true` -> session OK, sa `gestionnaire_initials` est en cookie.
   
   - Pas trouvé ou inactif -> page "Accès non autorisé, contacter l'admin".
3. RLS Supabase utilise `users.gestionnaire_initials` côté policy pour filtrer `copros`.

### Conséquences

**Positives**

- Mapping explicite et auditables.
- Nouveau collaborateur = 30 secondes de saisie admin.
- Départ d'un collaborateur = `is_active = false`, audit conservé.
- Découplage robuste entre la source (initiales SharePoint) et l'identité (Entra ID email).

**Négatives**

- Saisie manuelle initiale (~5-7 users).
- Si un gestionnaire change d'initiales côté Crypto (rare), il faut mettre à jour le mapping (admin alerté via la page `/admin/users` qui afficherait l'incohérence).

### Évolution post-MVP

Quand on migrera vers eStale, eStale identifie les gestionnaires différemment (par ID utilisateur, probablement). Le champ `gestionnaire_initials` deviendra `gestionnaire_external_ref` (typé selon `copros.source`). Refactor mineur, encapsulé dans le repository.

---

## ADR-011 - RLS Supabase activée dès J1, complexification par ajout de policies

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Le projet manipule des données sensibles (coordonnées, finances) avec un cloisonnement strict par gestionnaire au MVP, et un modèle de permissions extensible (cf. ADR-009).

Deux approches possibles :

1. Filtrer côté app (WHERE clauses dans tous les services). Risque : oubli, fuite si une route mal protégée tape la base.
2. **RLS Supabase** : la base elle-même refuse de retourner les lignes hors scope. Pas de fuite possible.

### Décision

**RLS activée dès J1 sur toutes les tables sensibles.**

**Politique simple au MVP** :

```sql
-- Politique sur copros (lecture)
create policy "gestionnaire voit ses copros" on copros
  for select
  using (
    gestionnaire_initials = (
      select gestionnaire_initials from users
      where users.id = auth.uid()
    )
  );
```

Mêmes patterns pour `evenements`, `jalons`, `activity_log`, etc. - toujours via une jointure sur `users`.

**Tables système exemptes de RLS** (mais accès restreint au service role) :

- `users` (lecture limitée à soi-même via une policy dédiée)
- `audit_log` (insert ok via fonction RPC, jamais select user-facing)
- `job_runs`
- `cabinet_settings`
- `gestionnaires_mapping` (équivalent : c'est dans `users` mais l'admin doit pouvoir lister, autre policy)

### Complexification = ajout, pas refonte

Quand on activera le rôle `comptable` (post-MVP) :

```sql
-- on AJOUTE une policy, on ne touche pas à l'existante
create policy "comptable voit toutes les copros" on copros
  for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid() and users.role = 'comptable'
    )
  );
```

PostgreSQL combine les policies en OR - le user voit la ligne si **au moins une** policy le permet. Pas de refonte.

### Tests obligatoires

- Tests de policies : un user gestionnaire connecté tente de lire une copro qui n'est pas la sienne -> 0 lignes retournées (pas 403, juste vide).
- Tests d'escalade : tentative de modifier `users.role` depuis l'app utilisateur -> bloqué.

### Conséquences

**Positives**

- Sécurité défense-en-profondeur : même si une route oublie un filtre, RLS bloque.
- Extensibilité = ajout de policies, jamais refonte.
- Le code applicatif ignore les permissions -> simpler.

**Négatives**

- Courbe d'apprentissage RLS (syntaxe Postgres, debug parfois opaque).
- Performance : RLS ajoute du WHERE implicite sur chaque requête. Pour notre volumétrie (168 copros), négligeable. À monitorer post-MVP si on dépasse les 10k lignes par table.

### Anti-pattern à éviter

Ne PAS désactiver RLS pour le service role et faire toute la logique côté Server Action. C'est tentant pour les Server Actions, mais ça contourne la défense. **Règle** : même les Server Actions tapent Supabase avec le client `auth-context-aware`, pas avec le service role, **sauf** pour les jobs cron (qui passent explicitement par le service role).

---

## ADR-012 - Génération PDF reportée post-MVP + retrait du deep-link Crypto

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Le mockup affiche des boutons de génération de documents (convocations PDF, ODJ PDF, note immeuble, impression du calendrier annuel). Ces fonctions sont visuellement présentes mais non triviales à implémenter en serverless.

Par ailleurs, le mockup montre un bouton "Ouvrir dans Crypto" - or Crypto est un logiciel desktop legacy non deep-linkable.

### Décision

**Génération PDF : reportée post-MVP.** Les boutons de génération restent affichés dans le mockup en MVP, mais désactivés (grisés) avec un tooltip "Disponible dans une version ultérieure".

**Deep-link Crypto : retiré.** Le bouton "Ouvrir dans Crypto" n'apparaît pas dans l'UI MVP, ni pour les copros sourcées SharePoint, ni pour aucune.

**Deep-link eStale : conservé.** URL pattern stocké en variable d'env `ESTALE_DEEPLINK_BASE`. Affiché sur les copros sourcées eStale.

### Justifications

**PDF reportée** :

- Puppeteer en serverless = bundle lourd, cold start élevé, gestion mémoire délicate (Vercel a une limite ~250 MB pour la fonction).
- Alternatives (react-pdf, @react-pdf/renderer) limitées côté layout complexe (convocations LRAR, ODJ multi-pages, etc.).
- Implémentation propre = 3-5 jours dédiés. Sort du périmètre MVP.
- Le manager peut utiliser Crypto/eStale en attendant pour générer ces documents.

**Retrait Crypto deep-link** :

- Crypto est un client lourd desktop, pas une web app.
- Pas d'URL scheme utilisable depuis un navigateur.
- Forcer l'utilisateur à copier le code copro pour le coller dans Crypto = friction acceptable au MVP.
- À terme (post-migration eStale), le sujet n'existe plus.

### Conséquences

**Positives**

- Périmètre MVP allégé, focus sur le différenciant (coordination, jalons, alertes).
- Pas de dette technique liée à un Puppeteer mal intégré.

**Négatives**

- Frustration utilisateur sur les boutons grisés. À atténuer par un tooltip explicite.
- Promesse implicite à tenir post-MVP - à inscrire en haut de la backlog vague 2.

### Conditions de réouverture

Si la génération de convocations devient critique avant la vague 2 (ex. trop de friction Crypto), on **ouvre un nouvel ADR** avec étude comparative Puppeteer / react-pdf / service externe (DocRaptor, PDFShift). Sinon, on attend.

---

## ADR-013 - Géocodage des adresses via Nominatim OSM dans le job de sync

**Date** : 2026-05-22 · **Statut** : Deprecated (MVP) · **Version** : v3

> v3 (2026-06-09) : **déprécié pour le MVP**. La mini-map Leaflet de la fiche copro est retirée (décision produit : pas d'utilité pour la coordination). Sans carte, plus de besoin de coordonnées lat/lng, donc plus de géocodage. L'ADR reste archivé : **à rouvrir** si un besoin cartographique réapparaît (vue carte du portefeuille, etc.). Les colonnes `copros.lat/lng` ne sont pas alimentées au MVP.
> 
> v2 : précision de l'apport eStale. Le type `Address` d'eStale expose `position: Point` (confirmé dans le SDL). Nominatim reste nécessaire pour les copros sourcées SharePoint/Crypto et devient un fallback en phase eStale (cf. ADR-022).

### Contexte

Le mockup affiche une **mini-carte Leaflet** sur la fiche copro. Pour positionner le marker, il faut des coordonnées géographiques (latitude/longitude).

Les sources externes stockent l'adresse en texte libre. SharePoint (export Crypto) ne fournit pas de coordonnées. eStale, lui, expose `Address.position: Point` (confirmé dans le SDL) : les coordonnées y sont natives.

### Décision

**Géocodage des adresses via Nominatim OSM (gratuit), exécuté dans le job de sync nocturne.**

- Lat/lng stockées en colonnes `copros.lat` et `copros.lng`.
- Géocodage UNIQUEMENT au premier sync d'une copro, ou si l'adresse change (détectée par diff).
- Rate limit Nominatim : 1 req/sec officiel. Sur 168 copros, premier sync = ~3 min de géocodage. Acceptable nocturne.
- Cache permanent en base (les copros déménagent rarement).
- Fallback en cas d'échec : adresse non géocodable -> carte non affichée, message "Localisation indisponible". Pas d'erreur applicative.

### Justifications

**Pourquoi Nominatim OSM** :

- Gratuit, pas de clé API à gérer côté Vercel.
- Couverture France excellente.
- Suffisant pour 168 adresses + ~10 nouvelles par an.
- Cohérent avec Leaflet (déjà OpenStreetMap).

**Conditions d'usage Nominatim** (importantes) :

- User-Agent identifiable obligatoire (header `User-Agent: REAL31-Intranet/1.0 (contact@real31.fr)`).
- Pas plus de 1 req/sec.
- Pas de bulk download, on est OK car on appelle à la demande.

### Alternatives rejetées (pour le MVP)

| Service                               | Pourquoi rejeté                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| MapBox Geocoding                      | Payant au-delà du free tier (50k req/mois - overkill). Clé API à gérer. |
| OpenCage                              | Payant, 2500 req/jour gratuit, overkill.                                |
| Google Geocoding                      | Payant, gestion clé API stricte.                                        |
| ban.openstreetmap.fr (BAN officielle) | Excellent pour FR, à reconsidérer post-MVP si Nominatim insuffisant.    |

### Conséquences

**Positives**

- Zéro coût, zéro clé à gérer.
- Couverture suffisante pour Toulouse + agglo.
- Si Nominatim down un soir, le sync continue (échec géocodage = lat/lng restent vides, on réessaye au prochain sync).

**Négatives**

- Qualité géocodage parfois inférieure à Google/MapBox (rare en zone urbaine).
- Latence non garantie (service communautaire).
- Si REAL31 s'étend à des zones rurales, qualité à revérifier.

### Évolution avec eStale (phases B/C)

Le type `Address` d'eStale expose `position: Point`. Selon la source de la copro (cf. les phases d'intégration d'ADR-022) :

- **Phase A (SharePoint / Crypto)** : pas de coordonnées en source, le géocodage Nominatim est **nécessaire**.
- **Phases B/C (eStale)** : `address.position` est natif. On lit les coordonnées directement depuis eStale ; Nominatim devient un **fallback** (ou n'est plus utilisé) pour ces copros.

La colonne cible `copros.lat/lng` reste alimentée soit par Nominatim (SharePoint), soit par `address.position` (eStale).

### Critère de réévaluation

Si > 5 % des adresses ne sont pas géocodables avec Nominatim -> migrer vers BAN ou MapBox.

---

## ADR-021 - Plateforme REAL31 unifiée : absorber l'app A, MVP strict, cohabitation Prisma/supabase-js

**Date** : 2026-05-27 · **Statut** : Accepted · **Version** : v1

### Contexte

REAL31 a deux applications web qui servent le même groupe :

- **App A - Registre des mandats** : gestion des mandats immobiliers (vente, gestion, dont contrats de syndic), signature électronique OneSpan, OCR scan-email. **En production** depuis mai 2026, utilisée quotidiennement par toute l'équipe, données réelles. Stack : Next 14, Prisma, Supabase (Paris), Vercel Pro, auth magic-link, users syncés depuis une liste SharePoint.
- **App B - Intranet REAL31** (ce projet) : surcouche de coordination AG/CS de copropriété. Bootstrap solide (archi hexagonale, ADR-001 à 013) mais peu de code applicatif, pas en prod.

Le dirigeant et l'équipe ont décidé d'unifier les deux en une seule plateforme : l'intranet devient la **porte d'entrée unique**, à terme 8 modules (cf. `ROADMAP.md`, section "Vision produit élargie"). Deux apps en prod en parallèle à terme = friction, double maintenance, double authentification.

Cette décision **élargit le périmètre posé par ADR-008**, qui cantonnait l'intranet à une fine surcouche de coordination, explicitement "pas un logiciel métier". ADR-008 reste valable pour son cœur (ne pas redévelopper ce qu'eStale fait déjà), mais le périmètre produit s'étend désormais à des modules métier (mandats, contrats). **ADR-021 prévaut sur ADR-008 pour la question du périmètre produit.**

### Décision

**1. Absorption, pas fusion 50/50.** L'app A sera **absorbée** dans l'intranet comme un module (module 8), pas fusionnée à parts égales. L'intranet (archi hexagonale) est la base cible et **l'autorité de qualité**. L'app A reste en prod telle quelle pendant la transition.

**2. MVP strict.** Le périmètre de développement actif est limité aux **5 premiers écrans** du mockup (Dashboard, Calendrier AG/CS, Mes événements simple, Fiche prépa AG, Fiche copro 360°). Aucun module 6/7/8 ni feature post-MVP n'est codé ou anticipé tant que le MVP n'est pas livré. Cette discipline protège un développeur solo de la dispersion.

**3. Coexistence bornée (~5 à 7 mois).** Pas de big bang. L'app A continue de servir l'équipe pendant que l'intranet se construit. L'absorption (port des intégrations OneSpan / Azure Document Intelligence / scan-email sous forme d'adapters) intervient **après le MVP**, en vague post-MVP.

**4. Cohabitation Prisma / supabase-js comme dette technique consciente.** Pendant la transition, l'app A garde Prisma (son ORM de prod) et l'intranet utilise supabase-js. Les deux coexisteront dans la plateforme cible le temps du port. C'est une **dette technique assumée et bornée**, pas un choix d'architecture durable. Le choix d'ORM cible final est traité par ADR-015 (resté ouvert), qui devra trancher la convergence en fin de transition. Conséquence connue : Prisma se connecte en direct au pooler et **bypasse la RLS** ; le code hérité de A garde donc son modèle de sécurité applicatif (rôle + scope) tant qu'il n'est pas reporté sous le modèle RLS de l'intranet (ADR-011).

**5. Module Contrats (module 7) - placement en attente.** Le dirigeant démarre un module de gestion des contrats (syndic-cabinet + fournisseurs). Proposition en cours : le développer **dans l'intranet** dès le départ plutôt qu'en standalone, pour éviter une seconde absorption douloureuse. **Décision en attente de sa validation** :

- Si oui : le module 7 entre dans la roadmap intranet en vague post-MVP 1 (après les 5 écrans).
- Si non : il démarre en standalone ; on coordonne uniquement la **modélisation des copropriétés** pour préparer une fusion ultérieure.

### Conséquences

**Positives**

- L'app A en prod n'est jamais mise en risque : zéro rupture de service, données réelles intactes.
- Time-to-value : le MVP syndic avance sans attendre une réécriture de A.
- La qualité (hexagonal, ADRs) s'applique au neuf ; l'existant est porté progressivement.
- Une seule porte d'entrée à terme pour l'équipe.

**Négatives**

- Dette de cohabitation Prisma / supabase-js à maintenir pendant ~5-7 mois, à résorber (ADR-015).
- Deux modèles de sécurité (applicatif côté A, RLS côté intranet) coexistent transitoirement.
- Risque de scope creep si la discipline "MVP strict" n'est pas tenue ; risque explicitement adressé par le point 2.

### Dettes techniques bornées

Dettes assumées sciemment, avec une cible de résolution pour éviter qu'elles s'installent durablement :

- **Cohabitation Prisma / supabase-js** : à résorber avant la fin du Q2 suivant l'absorption de l'app A (date à ajuster quand on aura un planning plus précis). La convergence d'ORM est tranchée par ADR-015.
- **Cohabitation magic link / Entra SSO** : à résorber dès que l'auth Entra SSO sera en place sur l'intranet (Increment J1b). Une fois Entra SSO opérationnel, le magic link hérité de l'app A est retiré au profit d'un modèle d'auth unique.

### Liens

- Élargit / prévaut sur **ADR-008** (périmètre) pour la question du scope produit.
- Dépend de **ADR-015** (ORM cible) pour la résorption finale de la cohabitation.
- Le port des intégrations de A suit le pattern adapters de **ADR-001**.
- Le modèle de sécurité cible reste **ADR-011** (RLS).

---

## ADR-022 - Positionnement de l'intranet vis-à-vis d'eStale et stratégie d'intégration défensive

**Date** : 2026-05-27 · **Statut** : Accepted · **Version** : v1

### Contexte

L'introspection du schéma GraphQL réel d'eStale (versionnée dans `docs/estale-schema.json`, SDL dans `docs/estale-schema.graphql`, résumé dans `docs/estale-schema-summary.md`) confirme une couverture métier très large : 495 object types, 314 input types, 125 mutations. eStale couvre la compta (6 types de Budget, Bank/Payin/Payout, Entry), les AG (Meeting 54 champs, MeetingMotion, MeetingInvitation), les fournisseurs, l'Open Banking (Powens), le Drive documentaire, le Mailing, le Kanban. `Condo` porte 120 champs, `Owner` 68.

Trois faits techniques structurants, vérifiés par introspection :

1. **5 queries top-level seulement** : `agency(id)`, `collaborator(id)`, `condo(id)`, `establishment(id)`, `me`. Aucune query "liste" cross-copros. Pour itérer sur les copros d'un gestionnaire, il faut passer par `me.collaborator.condos`.
2. **Pas de clé API stable et documentée à ce jour.** L'authentification se fait par cookie de session, obtenu via un login REST `POST /api/login`, puis appels GraphQL sur `POST https://api.estale.app/graphql/intranet`. eStale annonce une clé API "dans 2 mois", mais on planifie sur un scénario pessimiste (au plus tôt T+6 mois, au plus tard T+12 mois). Le test technique est validé : l'extraction du schéma en est la preuve.
3. **Contraintes d'API** : rate limit 50 req/s, timeout 30s.

Côté calendrier, la migration de REAL31 vers eStale prendra 6 à 7 mois minimum (4 copros pilotes aujourd'hui sur 160+). Pendant cette fenêtre, l'intranet doit délivrer de la valeur sur Crypto + SharePoint sans dépendre d'eStale.

### Décision

#### 1. Positionnement : extension, pas substitut

L'intranet REAL31 est l'**extension propre d'eStale, pas son concurrent**. Il ne redéveloppe pas le transactionnel (compta, AG, fournisseurs) qu'eStale fait nativement. Il remplace les bricolages Tampermonkey individuels par une plateforme unifiée, et apporte une couche de **pilotage et d'orchestration** au-dessus du transactionnel. Il consomme l'API eStale massivement en **lecture**, et écrit peu (les écritures concernent les workflows propres à REAL31 : jalons, audit log, présences pré-AG).

Périmètre = ce qu'eStale ne fait pas en natif, plus les workflows spécifiques REAL31 :

- Jalons réglementaires AG avec alertes automatiques (J-21, J-30, etc.) - cf. ADR-006.
- Vue cross-copros / dashboard transverse d'un gestionnaire (eStale n'a pas de query liste : on agrège côté intranet via `me.collaborator.condos`).
- Coordination interne et suivi des présences pré-AG (probabilité de quorum).
- Mapping initiales vers email Entra ID, spécifique REAL31 - cf. ADR-010.
- Audit log applicatif interne (conformité, qui a fait quoi) - cf. ADR-007.
- Modules secondaires : registre des mandats (app A à absorber, cf. ADR-021), divers syndic (badges, archives), agrégation des contrats fournisseurs.

#### 2. Stratégie défensive d'intégration en 3 phases

But : ne jamais faire dépendre une fonction critique d'un mécanisme d'accès eStale fragile, et absorber chaque évolution d'auth dans l'adapter sans toucher l'UI.

- **Phase A (T+0 à T+6 mois)** : source primaire = SharePoint (export Crypto). Aucune dépendance critique à eStale. L'intranet a déjà sa valeur (jalons, coordination, dashboard).
- **Phase B (T+6 à T+12 mois)** : source primaire = eStale via `EstaleCookieAdapter`. Auth par cookie de session (login REST `/api/login` avec un compte de service dédié, puis appels GraphQL avec le cookie). Tout le bricolage d'auth est isolé dans l'adapter.
- **Phase C (T+12 mois et au-delà, ou plus tôt si la clé API arrive)** : source primaire = eStale via `EstaleApiKeyAdapter` (Bearer token). Bascule par simple changement de variable d'environnement.

#### 3. Pattern technique

- Interface `EstaleProvider` dans `lib/ports/`.
- Deux implémentations dans `lib/adapters/estale/` : une à cookie de session, une à clé API.
- Sélection à l'initialisation selon la **présence de la variable d'env `ESTALE_API_KEY`** : présente, on prend l'adapter clé API ; absente, on retombe sur l'adapter cookie.
- L'archi hexagonale (ADR-001) absorbe la transition Phase B vers Phase C sans toucher l'UI ni les règles métier.

Cette décision **prolonge et précise ADR-005**, qui posait déjà la transition cookie vers clé API et deux clients d'auth. ADR-022 reformule le mécanisme de bascule autour de la présence de `ESTALE_API_KEY` plutôt que d'un flag `ESTALE_AUTH_METHOD`, et l'inscrit dans le plan de phases A/B/C. Les autres dispositions d'ADR-005 (compte de service unique, refresh paresseux sur 401, secrets chiffrés) restent valables.

#### 4. Mesures de protection contre les ruptures d'API

- **Ré-extraction périodique du schéma** : relancer l'introspection eStale puis régénérer SDL + résumé via `scripts/estale-schema-explore.mjs` (déjà créé). Cadence suggérée : mensuelle en manuel pour démarrer, hebdomadaire automatisée ensuite. Un diff du SDL versionné signale toute évolution cassante.
- **Génération de types TypeScript** via graphql-codegen, pour que toute suppression ou renommage de champ casse à la compilation. Choix de la lib à acter dans un ADR ultérieur, pas maintenant.
- **Cache local agressif côté Supabase** (read-through, cf. ADR-002) pour amortir le rate limit et survivre à une indisponibilité ponctuelle d'eStale.
- **Tests de contrat** pour détecter les régressions d'API, à introduire quand l'adapter eStale sera branché (Phase B).

#### 5. Limites connues de l'API eStale (contraintes architecturales)

- **Pas de query liste cross-copros** : impose le pattern `me.collaborator.condos` pour l'itération, et l'agrégation côté intranet pour les vues transverses.
- **Rate limit 50 req/s** : impose le batching et le cache. ADR-002 mentionnait 30 req/s par hypothèse ; l'introspection confirme 50 req/s, qui fait foi.
- **Timeout 30s** : impose des queries simples et ciblées, pas de méga-requêtes.
- **Auth par cookie de session** : sessions à rafraîchir périodiquement ; la durée de vie réelle est à mesurer côté `EstaleCookieAdapter`.

#### 6. Levier commercial

REAL31 va signer eStale pour ~7000 lots. C'est un levier de négociation, à actionner par le dirigeant lors du contrat eStale :

- accès anticipé à la clé API (programme bêta),
- engagement contractuel sur le délai de mise à disposition,
- documentation prioritaire.

### Conséquences

**Positives**

- L'intranet délivre de la valeur dès la Phase A, sans dépendre d'un accès eStale fragile.
- Chaque évolution d'auth eStale est absorbée dans un adapter, l'UI ne bouge pas.
- Schéma versionné + codegen + tests de contrat transforment une rupture d'API silencieuse en erreur visible (compilation ou test).
- Positionnement clair "extension d'eStale" : pas de redéveloppement du transactionnel, périmètre tenable.

**Négatives**

- L'auth par cookie reste un bricolage tant que la clé API n'est pas là (dette bornée, isolée dans l'adapter).
- L'absence de query liste impose de l'agrégation maison, plus coûteuse que si eStale l'offrait.
- Dépendance à un fournisseur dont le calendrier API n'est pas garanti ; mitigée par la stratégie de phases et le levier commercial.

### Liens

- **ADR-001** : l'abstraction ports/adapters rend la transition de phases invisible à l'UI.
- **ADR-002** : cache read-through, central pour amortir le rate limit et les indisponibilités (rate limit eStale : 50 req/s, valeur vérifiée).
- **ADR-003** : migration progressive Crypto vers eStale, copro par copro via `copros.source`.
- **ADR-005** : auth opérationnelle eStale (compte de service, refresh paresseux) ; ADR-022 précise le mécanisme de bascule via la présence de `ESTALE_API_KEY`.
- **ADR-013** : `Address` d'eStale expose `position: Point` (confirmé dans le SDL). En phase B/C les coordonnées sont natives ; Nominatim devient un fallback pour les copros sourcées SharePoint.
- **ADR-021** : plateforme unifiée ; l'intégration eStale est le socle de lecture de cette plateforme.

---

## ADR-023 - Écriture des dates AG/CS dans Copropriete (base partagée, dérogation ADR-002)

**Date** : 2026-06-11 - **Statut** : accepté (décision Sekou)

### Contexte

L'intranet partage la base Supabase `lgrsnrclufsulglbwcqi` avec un autre projet du patron (modèle Prisma de l'App A). Les dates de prochaine AG (`nextAGDate`) et de prochain CS (`nextCSDate`) vivent dans `public."Copropriete"`. Besoin métier : un gestionnaire doit pouvoir planifier / replanifier une AG ou un CS **non encore tenu** depuis la fiche. ADR-002 posait que l'intranet ne réécrit jamais la source ; mais la base est ici explicitement **partagée et mise à jour par les deux projets**.

### Décision

On écrit directement `nextAGDate` / `nextCSDate` dans `public."Copropriete"` (**option A** retenue par Sekou plutôt qu'un override natif), via service_role, **scopé par `managerId`** (un gestionnaire n'écrit que sur ses copros), avec `updatedAt` rafraîchi pour rester cohérent avec l'App A. `null` = déplanifier. C'est une **dérogation assumée à ADR-002**, justifiée par le modèle de base partagée : la date de planification est une donnée commune aux deux apps, pas une donnée de source en lecture seule.

### Conséquences

- La date modifiée est **visible côté App A** (propagation immédiate) ; concurrence d'écriture possible sur le même champ (risque faible, écritures rares).
- Le « CS préparatoire le » de la supervision (fiche 450) alimente `nextCSDate` par ce même chemin.
- Rappel : pas de RLS sur `public` (schéma Prisma, service_role) -> le cloisonnement est appliqué **en code** (filtre `managerId`), ce qui déroge aussi à ADR-011 (RLS dès J1). À reconsidérer si une RLS/vues devient possible.

### Liens

- **ADR-002** (dérogation au principe de non-réécriture de la source).
- **ADR-011** (RLS non disponible sur le schéma partagé Prisma -> cloisonnement en code).
- **ADR-021** (plateforme unifiée, cohabitation Prisma / supabase-js).

---

## ADR-017 - Auth library : Auth.js (NextAuth) v5

**Date** : 2026-06-16 - **Statut** : accepté

### Contexte

Le SSO Microsoft 365 (Entra ID) doit authentifier les collaborateurs. Deux voies : **Auth.js (NextAuth) v5** (provider Microsoft Entra ID intégré, gestion OAuth/OIDC + session) ou une **implémentation OIDC custom** (plus de contrôle, mais state/nonce/PKCE/validation des tokens à écrire et maintenir nous-mêmes - surface de sécurité).

### Décision

**Auth.js v5** (`next-auth@5`). Standard de l'écosystème Next.js, provider Entra ID natif, callback `/api/auth/callback/microsoft-entra-id` (déjà déclaré dans `docs/entra-app-registration.md`). Configuration `src/auth.ts` ; le provider n'est actif que si `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER` sont présents, sinon **fallback dev-login** (sélecteur de gestionnaire), pour ne pas bloquer le dev tant que le DSI/patron n'a pas créé l'App Registration. **Noms de variables alignés sur le projet App A du patron** (convention Auth.js par défaut, même tenant) -> config quasi identique. **App Registration dédiée `REAL31 Intranet`** (et non réutilisation de celle de l'App A) : choix de robustesse - secrets, Redirect URIs et permissions indépendants des deux applications.

L'identité (email du token) est mappée vers `public."User"` (`GestionnaireRepository.findByEmail`) -> le **cloisonnement par `managerId`** reste inchangé (cf. ADR-009). Le gate mot de passe (`proxy.ts`) se désactive automatiquement quand le SSO est actif.

### Conséquences

- Dette d'auth custom évitée ; mises à jour de sécurité déléguées à Auth.js.
- Dépendance beta (`next-auth@5.0.0-beta`) - acceptable, version largement utilisée ; à figer en stable quand elle sort.
- `AUTH_SECRET` (chiffrement session) généré côté projet, distinct des valeurs Azure.

### Liens

- **ADR-009** (cloisonnement gestionnaire), **ADR-010** (mapping identité), `docs/entra-app-registration.md`.

---

## ADR-024 - ODJ / résolutions : la "motion bank" eStale est la source, l'intranet orchestre

**Date** : 2026-06-17 - **Statut** : accepté

### Contexte

L'ODJ d'une AG = une liste de résolutions. Question : l'intranet doit-il gérer sa propre bibliothèque de modèles, ou réutiliser celle d'eStale ? Exploration de l'API (introspection `/graphql/intranet` + lecture live via le compte de service) : eStale expose une **"motion bank" à 3 niveaux** - `establishment` (cabinet), `collaborator` (gestionnaire), `condo` (copro). Le cabinet REAL31 y a déjà **109 résolutions** structurées (`title`, `body`, `preamble`/`postamble`, `majority` parmi `A24/A25/A25_1/A26/A26_1/UNANIMITY/QUESTION`, `keywords`, clé de répartition `dk`, pièces jointes), dont 95 `isDefault`. Mutations dispo : `createMotionBankItem/update/copy/order` ; côté AG (`Meeting`) : `createMotionsFromBank(itemIDs)`, `createMotion(input, files)`, `orderMotions`, `invitation` (convocation), `transcript` (PV).

### Décision

La **motion bank eStale est la source** des résolutions. L'intranet **ne stocke PAS de résolutions** et **ne reconstruit PAS de bibliothèque** (donc **pas de table `intranet_odj_resolutions`**, idée abandonnée). L'intranet = **couche d'orchestration / UX** : il lit la bank, aide à composer l'ODJ (mode CS), pousse les motions dans le `Meeting` eStale, gère le circuit de validation côté intranet (case "validé CS"), puis la convocation se déclenche dans eStale. Cohérent avec ADR-022 (eStale = primaire).

### Conséquences

- Annule la table de résolutions côté intranet (et l'écriture infra associée dans la base patron).
- Nouveau **port** hexagonal (bibliothèque de résolutions / motion bank) + adapter eStale - **lecture d'abord**, écriture ensuite.
- Les mutations écrivent dans eStale pour de vrai -> **commencer READ-ONLY**, tester les writes sur une AG de test, valider avant tout write réel.
- Renforce **ADR-005** (compte de service dédié) : les writes agissent au nom du compte connecté (auj. compte perso Sekou).
- convoc / tenue / PV se lisent du `Meeting` eStale (partage de responsabilité intranet / eStale).
- Script d'exploration : `scripts/estale-motion-bank.mjs` (lecture seule, sans secret).

### Liens

- **ADR-022** (positionnement eStale), **ADR-005** (compte service eStale), **ADR-001** (port).

---

## ADR-025 - Gestionnaire de mots de passe : maison, zero-knowledge, sur briques OSS auditées (serverless)

**Date** : 2026-06-18 - **Statut** : accepté

### Contexte

Besoin d'un coffre-fort de mots de passe pour le réseau immobilier (4 agences dont 1 siège, 4 services Vente/Syndic/Location/Gestion Locative, ~40 collaborateurs), intégré à l'intranet. Trois niveaux d'accès prioritaires : **réseau** (tous), **service** (transversal réseau : un coffre Vente pour les 4 agences), **personnel** ; un niveau **agence** à prévoir mais **latent** (pas exposé en UI). Migration initiale depuis un Excel de mots de passe en clair.

Build vs buy challengé : Bitwarden / 1Password org sont audités et se branchent sur Entra (SCIM), mais coût par siège, et l'auto-hébergement (Vaultwarden) impose Docker. Contrainte réelle de Sekou : **pas de coût récurrent par siège, pas de Docker/self-host** (on est serverless sur Vercel), ouvert à réutiliser de l'open source.

Contrainte cryptographique structurante : **aucune source d'entropie stable ET secrète n'existe dans un token MSAL/OIDC**. L'`oid`/`sub` est un identifiant (lu par le serveur, présent en base), pas un secret. Dériver une clé de chiffrement du SSO = théâtre de sécurité. SSO authentifie auprès du serveur ; il ne remet pas de secret côté utilisateur.

### Décision validé par Sekou

Construire le gestionnaire **maison**, en **zero-knowledge** (le serveur Vercel ne voit jamais ni secrets ni clés : c'est un coffre à blobs chiffrés + un coursier), **mais sans coder les primitives cryptographiques**. On assemble des briques **auditées** : **Web Crypto API** (AES-256-GCM, ECDH P-256, HKDF, PBKDF2), **SimpleWebAuthn** (passkey + extension PRF), **noble / hash-wasm** (Argon2id pour le chemin master-password). Modèle de référence = whitepaper sécurité **Bitwarden** / archi **Padloc**, sans copier leur code applicatif (licence AGPL). On écrit le produit et la glue, pas la cryptographie.

Choix verrouillés (validés avec Sekou) :

- **SSO Entra = authentification seulement, JAMAIS la clé de chiffrement.**
- **Déverrouillage : passkey / Windows Hello en primaire** (PRF -> clé stable tenue par l'authenticator = fluide ET zero-knowledge), **master password en repli**, **recovery code + escrow admin** pour la récupération. La clé privée de l'utilisateur est stockée **wrappée plusieurs fois** (une par méthode), donc le modèle est agnostique à la méthode de déverrouillage.
- **Modèle de données générique** : `vault.scope` (network / agency / service / personal) + FK nullables -> ajouter le niveau agence plus tard = activer un scope déjà prévu, **zéro migration**. **Tout accès est médié par `pm_membership`** (clé du coffre wrappée vers la clé publique du membre) -> RLS **uniforme et triviale**, identique pour les 4 scopes.
- **Partage** : paire ECDH par utilisateur, clé AES-GCM par coffre. L'octroi/re-wrap se fait par un **client admin custodien** (le serveur ne peut pas, il n'a pas la clé en clair) -> accès non instantané (flux "pending"). **Rotation au départ** = retrait du membership + rotation de la clé du coffre par un client admin + rotation des **vrais** mots de passe sensibles (la personne les a déjà lus).
- **Coffre "très sensible"** = tier **step-up** (facteur supplémentaire à l'ouverture, clé non gardée en cache) ; colonne `sensitivity` prévue dès maintenant, exploitée en phase 2.
- **Import Excel** : parsing **100% navigateur** (le fichier ne monte jamais en clair au serveur), chiffrement vers le coffre choisi, dédupe (url+email), puis rotation des secrets sensibles + destruction de l'Excel.
- **RLS = défense en profondeur, pas le rempart principal** : le vrai contrôle est la crypto (un bug RLS ne livre que du chiffré). Pont d'identité : le serveur valide le SSO puis émet un **JWT compatible Supabase** (signé avec le secret JWT du projet, `sub` = `pm_user.id`) pour que la RLS lise `auth.uid()`.
- **Risque n°1 = XSS** sur les routes du coffre (vol des secrets déchiffrés ou de la clé en mémoire) -> CSP stricte, pas de script tiers sur ces routes.

### Conséquences

- Nouvelles tables natives (schéma `public`, préfixe `intranet_pm_`) : `agency`, `service`, `user`, `user_service`, `user_unlock`, `vault`, `membership`, `secret`. RLS activée (service_role passe), médiée par `pm_membership`.
- Dépendances à ajouter : `@simplewebauthn/browser` + `@simplewebauthn/server`, `hash-wasm` (Argon2id), éventuellement `@noble/*`. Pas de Docker, tout serverless.
- Toute la crypto vit dans le navigateur (Web Crypto) -> le stateless serverless de Vercel n'est pas un problème (aucun état crypto côté serveur).
- Construction par **5 phases**, chacune validée avant la suivante (cf. ROADMAP) : (1) socle crypto + identité + pont MSAL->JWT ; (2) coffre perso end-to-end ; (3) coffres partagés (réseau+service, octroi admin) ; (4) import Excel ; (5) coffre très sensible (step-up) + rotation/révocation + audit.
- v1 (MVP) = phases 1 à 4 (coffres réseau/service/perso + unlock passkey + import). Phase 5 = au-delà.
- À vérifier en phase 1 : support PRF (`hmac-secret`) sur le parc (Windows Hello, navigateurs) ; gestion multi-postes (passkey souvent liée à l'appareil -> 2e passkey ou recovery code).

### Liens

- **ADR-001** (ports & adapters : la source de chaque donnée vit derrière un port), **ADR-011** (RLS Supabase), **ADR-017** (Auth.js v5 / Entra = couche d'authentification), **ADR-005** (compte de service / identité). Branche : `increment/03-coffre-mdp`.

---

## ADR-026 - Persistance des actions du cockpit "Mes emails" (table native intranet_mes_emails_etat)

**Date** : 2026-06-22 - **Statut** : accepté

### Contexte

Le cockpit "Mes emails" affiche le triage produit par assistant-ia (mails, classification, réponse + plan proposés). Jusqu'ici, les actions du gestionnaire (valider/classer, cocher une étape du plan, éditer le brouillon, changer le rattachement) n'étaient que de l'état local React : un rechargement effaçait tout. Le triage lui-même reste en lecture seule (fichier git-ignoré côté poste, cf. adapter-fichier) et n'a pas vocation à être réécrit.

### Décision validé par Sekou

Persister uniquement ce que le gestionnaire FAIT sur un mail, dans une table native `public.intranet_mes_emails_etat`, cloisonnée par gestionnaire, clé logique `(gestionnaire_id, email_id)`. Le triage (la proposition) reste la source amont en lecture ; l'état de traitement est une couche intranet par-dessus, exactement comme `intranet_supervision_items` / `intranet_jalons` portent l'état et non le référentiel.

- Colonnes : `statut` ('nouveau'|'repondu'|'classe'), `etapes_faites` (jsonb), `lu`, `brouillon` (réponse éditée), `rattachement` (override jsonb).
- Chaîne hexagonale standard : port `MesEmailsEtatRepository`, adapters mock + supabase (upsert service_role), routeur (bascule `COPRO_SOURCE`), fusion de l'état dans `getMesEmails`, server actions sous `app/mes-emails/`.
- Cloisonnement : l'identité vient de `getGestionnaireCourant` (SSO Entra ou dev-login) ; chaque server action vérifie `coproAppartient(coproCode)` avant d'écrire, et `getEtats` ne lit que les lignes du gestionnaire. Conforme ADR-009/011 (cloisonnement en code, RLS post-MVP).

### Conséquences

- Nouvelle table native (schéma public, préfixe `intranet_`), à créer une fois via `supabase/sql/intranet_mes_emails_etat.sql`. RLS non activée au MVP (service_role), cloisonnement en code.
- Le cockpit reflète l'état persisté au rechargement (le service fusionne l'état dans chaque `MailEntrant`) ; l'UI garde un état optimiste local pour la réactivité.
- L'override de rattachement et le brouillon édité sont conservés ; le triage d'origine n'est jamais muté.
- Étape suivante naturelle (hors scope) : transformer "valider" en véritable action sortante (envoi réel via Graph, création de ticket/dossier), une fois M365 branché.

### Liens

- **ADR-001** (ports & adapters), **ADR-002** (intranet = tables natives, on ne réécrit pas la source), **ADR-009/011** (cloisonnement managerId puis RLS). Branche : `increment/02-supabase`. Source du triage : assistant-ia (pipeline Mistral) + adapter-fichier.

---

## ADR-027 - Ingestion mail "Mes emails" : Application (app-only) + Access Policy, pas délégué

**Date** : 2026-06-24 - **Statut** : accepté

### Contexte

Le module "Mes emails" doit lire la boîte entrante d'un gestionnaire pour la trier. Deux modèles d'accès Microsoft Graph :

- **Délégué** : l'app lit la boîte de l'utilisateur connecté avec son jeton SSO (`Mail.Read` Delegated + `offline_access`). Moindre privilège intrinsèque, **zéro PowerShell**, mais **interactif** (synchro déclenchée quand l'utilisateur est connecté) et nécessite de capter l'access token dans Auth.js.
- **Application (app-only)** : l'app lit via son propre identifiant (client credentials), **en tâche de fond**, sans utilisateur. `Mail.Read` Application donne accès à TOUTES les boîtes -> on borne par une **Application Access Policy** (PowerShell Exchange) à un groupe de boîtes autorisées.

Au moment de brancher le pilote, le DSI était prêt à accorder l'accès et proposait précisément la **restriction par boîte en PowerShell** - qui EST le mécanisme Application Access Policy. Et le besoin exprimé (Sekou) = synchroniser **toute l'inbox** du pilote, y compris en tâche de fond. Le choix initial "délégué" est donc révisé.

### Décision validé par Sekou

**Ingestion en mode Application (app-only) + Application Access Policy**, pas délégué.

- Permission `Mail.Read` **Application** sur l'app existante `REAL31 Intranet` + admin consent.
- **Application Access Policy** (`New-ApplicationAccessPolicy ... -AccessRight RestrictAccess`) scopée sur un **groupe de sécurité à extension messagerie** `REAL31-Intranet-MailRead` -> moindre privilège réel (l'app ne lit que les boîtes du groupe, pas les ~44 du tenant).
- Adapter Graph **app-only en plain fetch** (token client_credentials avec le secret de l'app, `GET /users/{boite}/mailFolders/inbox/messages`), derrière le port `MailIngestionProvider`. Pas de SDK Graph, pas de nouveau secret. Activation par `MAIL_SOURCE=graph`.
- Instructions DSI : `docs/entra-app-registration.md` étape 2bis.

### Conséquences

- **Passage à l'échelle** : la policy se crée UNE fois ; ajouter un gestionnaire = `Add-DistributionGroupMember` sur le groupe (ou via l'admin center, sans PowerShell). **Pas de commande complète par salarié.** Probablement seuls les gestionnaires syndic sont concernés, pas les 44.
- **Synchro de fond** possible (cron à venir) sans que le gestionnaire soit connecté.
- **Réversibilité** : tout est derrière le port `MailIngestionProvider`. Basculer en délégué plus tard (zéro intervention DSI à chaque arrivée, au prix de l'interactif) = un autre adapter + capter le token SSO, **sans toucher le pipeline ni le cockpit**.
- Le cache du triage vit dans `intranet_mes_emails_triage` (cf. ADR-026).

### Liens

- **ADR-001** (ports & adapters : ingestion derrière `MailIngestionProvider`), **ADR-026** (état/triage "Mes emails"), **ADR-017** (Auth.js v5 / Entra), **ADR-005** (compte de service / identité d'app). Branche : `increment/02-supabase`. Instructions DSI : `docs/entra-app-registration.md` étape 2bis.

---

## ADR-028 - Courriers sinistre : composer un brouillon mail NEUF via le module Mail (extension du port)

**Date** : 2026-06-29 - **Statut** : accepté (validé par Sekou le 2026-06-29, Vague 4 lancée)

### Contexte

Le module sinistre genere 9 courriers-types (demande d'attestation, declaration assureur, recours...). Aujourd'hui leur sortie est `mailto:` + copier + imprimer (`CourriersScreen.tsx`) : corps en texte brut, mise en forme perdue, limite de longueur d'URL sur les gros courriers, aucune tracabilite (pas de fil, pas de brouillon archive). On veut les envoyer via le module Mail (Graph), comme pour Mes emails.

Probleme d'architecture : le port `MailOutboundProvider` (partage avec Mes emails) est **reponse-seulement**. Ses deux methodes (`creerBrouillon`, `envoyer`) exigent un `internetMessageId` (elles font `createReply` sur un mail existant : fil + citation conserves). Or un courrier sinistre est un mail **neuf**, sortant a froid vers un assureur ou un tiers : il n'y a pas de message d'origine auquel repondre. **Aucune methode de composition fraiche n'existe.**

### Décision proposée

Etendre `MailOutboundProvider` avec une methode additive de composition neuve, sans casser l'existant :

```
creerBrouillonNeuf(p: {
  boite: string;          // la boite du gestionnaire (resolue de la session, JAMAIS du client)
  sujet: string;
  corps: string;          // HTML (meme rendu Aptos 11 que envoyer())
  a?: string[];           // destinataires optionnels (souvent a completer a la main par le gestionnaire)
  cc?: string[];
  pjIds?: never;          // pas de PJ a re-joindre ici (mail neuf, pas une reponse)
}): Promise<{ webLink?: string }>;  // lien Outlook du brouillon cree, si dispo
```

Adapter Graph : `POST /users/{boite}/messages` (cree un brouillon dans la boite, statut Draft). Mock : no-op tracable.

**Par defaut : brouillon SEULEMENT, pas d'envoi automatique.** Un courrier sinistre part vers un tiers externe (assureur) : on ne l'envoie pas en app-only sans relecture humaine. Le gestionnaire ouvre le brouillon dans Outlook, complete/verifie le destinataire, et envoie lui-meme (l'add-in Signitic s'applique alors a l'ouverture cote client -> on n'injecte PAS la signature dans le brouillon, coherent avec la decision design de `creerBrouillon`). Un envoi direct (`Mail.Send`, deja accorde) reste possible plus tard, mais hors scope de cet ADR.

### Alternatives ecartees

- **A - Statu quo `mailto:`** : zero cout mais perd la mise en forme, bute sur la longueur d'URL, aucune tracabilite. Insuffisant pour un courrier officiel.
- **B - Generer un PDF/docx telechargeable** : complement utile (archivage, courrier papier) mais ne donne ni le fil mail ni la tracabilite Outlook ; et la generation PDF est deja reportee post-MVP (ADR-012). A traiter separement, pas un substitut.
- **C - Reutiliser `envoyer()` avec un faux `internetMessageId`** : impossible proprement (la methode fait `createReply`, il faut un vrai message). Detournement fragile, rejete.

### Conséquences

- Une methode additive sur un port PARTAGE : Mes emails n'est pas impacte (signature inchangee de `creerBrouillon`/`envoyer`). Adapter Graph + mock a etendre, plus le routeur si besoin.
- Cote sinistre : `CourriersScreen` remplace `mailto:` par un bouton "Creer le brouillon dans ma boite" qui appelle une Server Action -> `creerBrouillonNeuf`. **Cloisonnement** : la `boite` vient de `getGestionnaireCourant` (la sienne), jamais d'un parametre client ; bornes zod sur sujet/corps/destinataires.
- **Permissions Graph** : la creation de brouillon est couverte par `Mail.ReadWrite` (deja accorde), **aucune nouvelle permission DSI requise** tant qu'on reste en brouillon. Un futur envoi direct utiliserait `Mail.Send` (deja accorde), borne par l'Application Access Policy (ADR-027).
- Le destinataire reste souvent a completer a la main (l'assureur exact depend du dossier) : viser d'abord "brouillon pre-rempli sujet+corps, destinataire optionnel", pas un envoi force.

### Liens

- **ADR-001** (ports & adapters), **ADR-027** (mail app-only + Access Policy), **ADR-012** (PDF reporte). Module Mail : `MailOutboundProvider`, `graph-mail-outbound.ts`. Branche : `increment/05-sinistres`. Declencheur : Vague 4 du chantier sinistre (automatisation des courriers).

---

## ADR-029 - reprise-copro devient un module natif de l'intranet (domaine copié, voie B1)

**Date** : 2026-07-06 - **Statut** : accepté (Sekou, 2026-07-08)

### Contexte

`reprise-copro` est un outil d'onboarding de copropriété (offre -> reprise immeuble -> intégration eStale -> mise en service), développé comme repo externe séparé mais **volontairement construit sur la même stack que l'intranet** (Next 16, TS strict, Tailwind 4, Supabase, hexagonal) en vue d'une réintégration. Deux pages fonctionnelles mais hors design system (Tailwind brut, pas de vocabulaire ni de navigation partagés avec l'intranet), 51 tests verts sur le cœur métier (domaine + xlsx + orchestrateur GO/STOP). L'analyse complète est dans `docs/reprise-copro-integration-proposition.md` (option A "rester un site séparé, juste restylé" vs option B "ré-intégrer comme module natif"). Cette décision a déjà été mise en œuvre en code (branche `integration/reprise-copro`, Inc. 1 livré le 2026-07-01) mais n'avait jamais été formalisée en ADR - relevé par l'audit pré-prod.

### Décision

**Option B retenue : module natif `/reprise-copro`** dans l'intranet (route + entrée sidebar + `AppShell`), pas un site séparé restylé (option A écartée : duplication du design system, double auth/nav, deux apps à maintenir). Le domaine prouvé de reprise-copro (domaine, auto-checks, dedup, règles, normaliseur, génération xlsx, orchestrateur, suivi, templates) est **copié** (voie B1) et namespacé sous `src/lib/reprise/`, imports réécrits `@/lib/` -> `@/lib/reprise/`. Le repo `reprise-copro` d'origine est **gelé** (copie unidirectionnelle, pas de synchronisation retour). Le module consomme exclusivement `@/components/ui/*` (pas de doublon de primitives - contre-exemple à ne pas reproduire : le module sinistre a dupliqué `sinistre/ui.tsx`). Respecte ADR-001 (hexagonal + `eslint-plugin-boundaries`) et s'inscrit dans la plateforme unifiée d'ADR-021.

**Sous-décision (axe 2, parcours) - révisée le 2026-07-01** : le parcours n'utilise **pas** le moteur de wizard du module sinistre (arbre de décision) : la reprise est une procédure **linéaire**, pilotée par l'IA. Le parcours retenu est une **fiche-hub** (`/reprise-copro/dossiers/[id]`) : créer la copro (nom, référence S0XXX, adresse) -> l'IA extrait cadrage + patrimoine des documents -> l'humain vérifie (coche) -> injection eStale -> checklist humaine pour ce que l'IA ne fait pas (vérifications V1-V4, finalisation P5, comptabilité C1-C6, clôture). Le suivi reste porté par le `dossier.ts` propre à reprise-copro (agrégat jumeau, voie B-β) plutôt que par le `Dossier` générique de l'intranet ; l'unification (B-α) est différée à un ADR ultérieur, quand le modèle de suivi partagé sera stabilisé.

### B1 vs B2 - tranché (2026-07-08)

- **B1 - copie : retenue DURABLEMENT.** La version sous `src/lib/reprise/` est la seule vivante ; le repo externe `reprise-copro` reste gelé et sera archivé. Pas de synchronisation retour.
- **B2 - package partagé (monorepo)** : écarté - il ne se justifierait que si les deux bases devaient cohabiter durablement, ce qui n'est pas le cas.

### Conséquences

**Positives**

- Un seul produit, une seule auth/nav, design system et vocabulaire partagés par construction.
- Supabase déjà mutualisé (même projet, tables préfixées `reprise_`) - ré-intégration data peu coûteuse.
- Cohérent avec l'absorption de l'app A (ADR-021) : le pattern d'ajout de module est déjà rôdé.

**Négatives**

- Deux copies du domaine coexistent tant que `reprise-copro` (repo externe) n'est pas officiellement abandonné.
- Le choix B-β (agrégat jumeau plutôt que `Dossier` unifié) est une dette de modélisation assumée, à revisiter.

### Liens

- **ADR-001** (ports & adapters, boundaries), **ADR-021** (plateforme unifiée). Doc source : `docs/reprise-copro-integration-proposition.md` (section 0bis, décisions validées 2026-07-01). Branche : `integration/reprise-copro`.

---

## ADR-030 - Port d'écriture eStale + injection full-granular par ID capturé

**Date** : 2026-07-06 - **Statut** : accepté avec ajustements (Sekou, 2026-07-08)

### Contexte

Historiquement (ROADMAP de reprise-copro), la sortie du module patrimoine était 5 fichiers xlsx importés à la main dans eStale. L'introspection du schéma eStale (`docs/estale-schema.json`) a révélé que l'API expose l'écriture complète du patrimoine, sous deux formes : import en masse (`importLots/Owners/Links/Entries`, prend un fichier, retourne `Condo` sans les lignes créées) et création granulaire (`createLot/createDK/createOwner`, retourne l'entité créée avec sa `reference`/son `code`). La voie granulaire résout le problème historique des codes 4-caractères qui forçait un workflow "links" en 2 phases (import owners -> export des codes -> réimport des links) : en capturant les IDs eStale renvoyés par chaque création, on câble lots/clés/owners/liens sans jamais dépendre de la référence 4-caractères ni d'un ré-import.

Cette voie (**la plus automatisée**, option 3 du doc `docs/reprise-copro-integration-proposition.md` section 4) écrit réellement en production eStale - c'est la décision la plus sensible du module, et celle qui n'avait pas d'ADR alors qu'elle **écrit dans un système tiers de production**. Une première injection réelle complète a eu lieu le 2026-07-06 (jalon, cf. `ROADMAP.md`) : copro test **S0305 Gaultier 4** (Courbevoie, établissement LGC) créée avec 81 lots, 6 clés, 297 tantièmes, 28 owners, 81 liens = 493 opérations, succès complet.

### Décision

**Port `EstaleEcritureProvider`** (`src/lib/reprise/ports/estale-ecriture-provider.ts`) : une méthode par mutation eStale - `creerCopro`, `creerLot`, `creerCle`, `mettreAJourCle`, `poserTantieme`, `creerOwner`, `relierOwnerAuLot`. Chaque création retourne l'ID (et la référence/le code) capturé, pour câbler l'étape suivante. Le port ne dépend pas du schéma eStale généré (types re-déclarés côté reprise) : le service qui l'appelle ignore s'il parle à un dry-run ou à un vrai client GraphQL.

**Ordre d'import imposé par eStale, strictement respecté** : lots -> clés -> tantièmes -> owners -> links. Implémenté dans `src/lib/reprise/services/injecter-patrimoine.ts` (`injecterPatrimoine`), qui capture les IDs dans des `Map` (`lotParNum`, `cleParCode`, `ownerParId`) au fil de l'eau pour câbler chaque étape suivante par ID interne, sans jamais dépendre des codes 4-caractères.

**DRY-RUN par défaut, gate explicite pour le réel** : `src/lib/reprise/adapters/router.ts` (`getEstaleEcritureProvider`) renvoie par défaut `DryRunEstaleEcritureProvider` (aucun réseau). Il ne bascule sur `ReelEstaleEcritureProvider` (`src/lib/reprise/adapters/estale-ecriture/reel-provider.ts`, qui écrit réellement via `estaleGql`) que si **deux conditions cumulatives** sont réunies (`ecritureEstaleReelle()`) : la variable d'env `ESTALE_ECRITURE=reel` **et** des identifiants eStale présents (`estaleConfigure()`). En complément, l'UI (`fiche-dossier-reprise.tsx`) affiche le mode actif et exige une **confirmation GO/STOP humaine** (modale `useConfirm`, rouge/"danger" en mode réel avec le texte "Ecriture REELLE dans eStale (PRODUCTION)... Confirmer ?", verte/légère en dry-run) avant tout déclenchement, quel que soit le mode.

**Throttle sous le rate limit eStale** : `ReelEstaleEcritureProvider` sérialise tous les appels derrière un espacement minimal de **25 ms** (`ESPACEMENT_MIN_MS`), soit <= 40 req/s, sous le plafond eStale de 50 req/s (ADR-022) avec une marge de sécurité - nécessaire car tantièmes et liens sont des appels granulaires (un par (clé, lot) et par lot), donc potentiellement des centaines d'appels sur une grosse copro.

**Règles eStale découvertes en conditions réelles** (chacune fixée après un échec de prod, avec test vitest de non-régression) :

- **Clé "Charges générales" auto-créée** par `createCondo` (retourne `mainDKID`) : elle est **réutilisée**, jamais recréée via `createDK` (sinon conflit côté eStale) - repli sur le code "001" si le flag `defaut` est absent du jeu. Elle porte un tantième placeholder (souvent 1) : `mettreAJourCle`/`updateDK.update` la met à jour avec le vrai total EDD.
- **Nom de clé <= 80 caractères** (`LIMITE_NOM_CLE` dans `services/mapping-estale.ts`) : au-delà, l'API renvoie une erreur générique non actionnable. Troncature automatique + report du reste en commentaire (<= 500 car), avec avertissement.
- **Représentant légal obligatoire pour une personne morale** : `OwnerInput.firstname` sert de représentant légal et est refusé vide côté eStale pour une société. Repli **"SERVICE SYNDIC"** par défaut (`REPRESENTANT_DEFAUT`) quand aucun gérant n'est identifié - **décision cabinet**, avec avertissement à valider/compléter par un humain.
- **Numéro de voie <= 5 caractères** (`LIMITE_NUM_ADRESSE`) : un numéro brut type "176 BIS" est découpé en numéro pur ("176") + suffixe alphabétique reporté en tête de la voie ("BIS ..."). Un numéro **composé** ("64-66", plage d'adresse chiffre-tiret-chiffre) reste **entier** dans le numéro, jamais scindé (incident réel constaté : couper sur le tiret faisait dépasser la voie de sa propre limite).

**Rollback préparé mais non auto-exécuté** : `RapportInjection.rollback` liste, dans l'ordre inverse de création, chaque entité créée (`EntiteCreee { type, id, cibleDomaine }`). eStale expose un `.delete()` par objet-mutation (`updateLot(id).delete()`, `updateOwner(id).delete()`, `updateDK(id).delete()`, `updateCondo(id).delete()`) qui permettrait de défaire une injection partielle, mais **le service ne l'appelle jamais automatiquement** en cas d'échec - il s'arrête et renvoie le plan de rollback prêt à l'emploi, laissant le geste de défaire (ou de reprendre) à un humain. Aujourd'hui, une injection interrompue en cours de route laisse une copro partielle à nettoyer à la main côté eStale (constaté sur plusieurs runs d'essai).

**Règle d'exploitation TRANSITOIRE : jamais `ESTALE_ECRITURE=reel` sur Vercel (aujourd'hui).** Une injection réelle est pour l'instant un **geste de poste local** : Sekou pose la variable et les identifiants dans son environnement de dev, jamais dans les variables d'environnement du déploiement Vercel. Ça évite qu'un déploiement prod expose, même accidentellement, la possibilité d'écrire en production eStale depuis une requête HTTP publique. **Ajustement 2026-07-08 (Sekou) : ce n'est PAS une règle permanente - la cible produit est de pouvoir injecter DEPUIS LE SITE.** Prérequis avant de lever la règle : (a) SSO obligatoire sur le chemin (pas de fallback), (b) exécution longue maîtrisée sur Vercel (maxDuration/jobs - cf. murs plateforme relevés par l'audit pré-prod), (c) le GO/STOP humain conservé tel quel, (d) **pouvoir CORRIGER les données extraites dans l'UI avant d'injecter** (voir "Manque produit" ci-dessous).

**Manque produit identifié (Sekou, 2026-07-08) : pas d'édition du jeu extrait.** Quand l'analyse remonte des erreurs bloquantes (lot orphelin, nom vide, adresse incomplète...), l'utilisateur n'a AUCUN moyen de corriger dans l'app : le jeu est en lecture seule, la seule issue est de re-analyser en espérant mieux, ou d'abandonner. C'est une impasse d'usage réel (constatée sur S0305 : la correction de la ville de l'owner o9 a dû être faite par script directement en base). **Chantier prioritaire : un éditeur de corrections du jeu persisté** (éditer lots/clés/tantièmes/owners/attributions, re-passer les auto-checks, persister) - c'est aussi le prérequis (d) de l'injection depuis le site.

**Ligne rouge (inchangée) : pas d'injection via API/MCP.** Le GO/STOP humain (la modale de confirmation dans l'UI) est **le seul verrou** avant une écriture réelle. Aucun chemin d'automatisation (script, API exposée, MCP, cron) ne doit pouvoir déclencher `ecritureEstaleReelle()` sans ce geste humain explicite - y compris le jour où l'injection se fera depuis le site.

### Conséquences

**Positives**

- Résout le problème historique des codes 4-caractères et de la phase B links (plus besoin de ré-import).
- Idempotence par capture d'ID : chaque étape sait sur quoi elle s'appuie, feedback ligne par ligne (quelle opération a échoué).
- Premier run réel validé en grandeur nature (S0305, 493 opérations, succès complet, 2026-07-06).

**Négatives**

- Rollback non automatique : une injection interrompue laisse une copro partielle, nettoyage manuel aujourd'hui.
- Les règles eStale découvertes en réel (clé par défaut, longueurs de champs, représentant légal) sont des contraintes d'une API tierce non documentée formellement : risque de dérive si eStale change son comportement (cf. ADR-022, ré-introspection périodique).
- Le mapping domaine -> eStale (`services/mapping-estale.ts`) applique plusieurs replis silencieux mais **signalés** (avertissements) qui restent à valider par un humain avant une injection définitive (adresse incomplète, résident dérivé, quote-part égale par défaut, division FREEHOLD par défaut).

### Liens

- **ADR-001** (ports & adapters), **ADR-002** / **ADR-022** (rate limit eStale 50 req/s, positionnement défensif eStale), **ADR-029** (module natif reprise-copro). Doc source : `docs/reprise-copro-integration-proposition.md` (section 4, carte d'écriture vérifiée). Jalon : `ROADMAP.md`, entrée 2026-07-06.

---

## ADR-031 - Extraction des documents par IA avec routeur de providers

**Date** : 2026-07-06 - **Statut** : accepté (Sekou, 2026-07-08 - le mode CLI reste un outil de test local assumé ; la prod visera une clé API dédiée)

### Contexte

L'extraction du patrimoine (lots, clés, tantièmes) et des propriétaires (owners, attributions) à partir des PDF du syndic sortant (RCP, EDD, modificatifs, annexes comptables/RGDD, feuille de présence, PV) est confiée à un moteur IA. Plusieurs moteurs sont utilisables selon le contexte (dev sans clé API, test en session Claude Max, production) : il faut pouvoir switcher sans toucher au domaine ni aux prompts. Le choix du moteur par défaut et la place de la CLI Claude Code (mode test) n'avaient jamais été formalisés en ADR, alors que le mode CLI touche à une zone grise de CGU (ToS Anthropic) et n'est pas déployable.

### Décision

**Port `ExtractionProvider`** (`src/lib/reprise/ports/extraction-provider.ts`) : deux méthodes, `extrairePatrimoine` (Agent 1 - RCP/EDD/modificatifs -> lots/clés/tantièmes) et `extraireProprietaires` (Agent 2 - feuille de présence/PV -> owners/attributions), fidèles au protocole à 2 sous-agents documenté côté vault. Un 3e "agent" (construction + auto-checks) n'est **pas** un appel IA : c'est du code déterministe (`domain/auto-checks.ts`).

**Routeur de sélection** (`src/lib/reprise/adapters/router.ts`, `modeExtraction()`/`getExtractionProvider()`) : `EXTRACTION_PROVIDER=claude-cli|claude|mistral|mock`, ou détection automatique par variable présente (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` -> claude, sinon `MISTRAL_API_KEY` -> mistral, sinon mock). Quatre adapters : `adapters/claude/claude-extraction-provider.ts` (SDK `@anthropic-ai/sdk`, défaut prod visé), `adapters/mistral/mistral-extraction-provider.ts` (fallback souverain EU), `adapters/claude-cli/claude-cli-extraction-provider.ts` (voir ci-dessous), `adapters/extraction/mock-extraction-provider.ts` (démonstration, copro canonique sans IA). En production, si le mode résolu est `mock`, le routeur **refuse explicitement** (throw) plutôt que de renvoyer silencieusement une fausse extraction sur un vrai PDF.

**Prompts partagés, engine-agnostiques** : `adapters/shared/prompts-extraction.ts` (`SYSTEME_PATRIMOINE`, `SYSTEME_PROPRIETAIRES`) encode les règles cabinet une seule fois, consommées par tous les adapters IA (Claude, Claude CLI, Mistral) - un seul endroit où faire évoluer les règles, quel que soit le moteur. Un **normaliseur** partagé (`adapters/shared/normaliser.ts`) met en forme la sortie JSON brute du modèle vers les types domaine (`ResultatPatrimoine`/`ResultatProprietaires`), quel que soit l'adapter.

**Auto-checks déterministes en filet** : `domain/auto-checks.ts` (`verifierTout`) revérifie systématiquement le jeu de données produit par l'IA (5 blocs de vérifications, `ok = 0 erreur`), **indépendamment du moteur utilisé**. La production des xlsx et l'injection eStale (ADR-030) refusent de s'exécuter si des erreurs bloquantes subsistent (`refuserSiErreurs` dans `services/orchestrateur-patrimoine.ts`) - le filet s'applique même si l'extraction IA a mal fonctionné.

**Aiguillage des documents par agent** : `services/orchestrateur-patrimoine.ts` route chaque document vers le bon agent par un filtre sur le nom de fichier (`pourStructure` : RCP/EDD/RGDD/annexes/budget -> Agent 1 ; `pourProprietaires` : feuille de présence/PV -> Agent 2), avec repli "aux deux agents" si le nom ne matche aucun filtre. Réduit le volume par requête (limite Claude de 100 pages/requête) et cible chaque agent sur les documents pertinents.

**Les annexes comptables (RGDD) font foi pour les clés réelles** : le prompt `SYSTEME_PATRIMOINE` impose qu'en présence d'annexes comptables/RGDD/états de répartition, ce sont eux qui priment sur le RCP pour les clés effectivement utilisées en comptabilité (une charge regroupée en une colonne au RCP peut être éclatée en plusieurs clés réelles, ex. eau froide vs eau chaude/chauffage). Sans document comptable, on se base sur le RCP et on signale l'ambiguïté en note plutôt que de trancher silencieusement.

**Mode CLI Claude Code - réservé au test, jamais à la prod.** `adapters/claude-cli/claude-cli-extraction-provider.ts` invoque le binaire `claude -p` en sous-processus (session utilisateur, ex. plan Max), écrit les PDF en fichiers temporaires et laisse la CLI les lire (outil `Read`, vision native pour les scans), sans passer par le SDK ni par une clé API. Retire explicitement `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` de l'environnement du sous-processus pour forcer la session Max plutôt que l'API métrée. **Limite assumée** : utiliser une session interactive personnelle pour un traitement programmatique en batch est une **zone grise vis-à-vis des CGU Anthropic**, et le mode n'est utilisable que sur un poste local avec une session ouverte (non déployable sur Vercel, pas fait pour le scale). La voie de production visée reste une **clé API dédiée** (adapter Claude SDK ou Mistral), le mode CLI servant uniquement à valider la qualité d'extraction sur de vrais documents sans engager de coût API pendant la phase de mise au point.

### Conséquences

**Positives**

- Un seul jeu de prompts et de règles cabinet, indépendant du moteur - changer de moteur ne change pas le comportement métier.
- Le filet d'auto-checks déterministes absorbe les variations de qualité entre moteurs (Claude API/CLI, Mistral, mock).
- Le mode CLI a permis de valider l'extraction sur un vrai cas (S0305) sans dépendre d'une clé API payante pendant la mise au point.

**Négatives**

- Le mode CLI est une dette explicite : zone grise ToS, poste local uniquement, à ne jamais activer en production (le binaire `claude` n'existe de toute façon pas sur Vercel, donc échec net plutôt que silencieux, mais reste un garde-fou à surveiller).
- Le RGPD (PII des copropriétaires transitant par un tiers IA externe) reste **hors périmètre à ce stade** (décision Sekou du 2026-07-01) : sujet à rouvrir plus tard, notamment si le moteur de production change de zone d'inférence.

### Liens

- **ADR-030** (l'extraction alimente le jeu injecté), **ADR-029** (module natif). Doc source : `docs/reprise-copro-integration-proposition.md` (section 1.1, section 7 point 5).

---

## ADR-032 - Module Facturation des honoraires syndic : tables `intranet_*`, recalcul serveur, brouillons Pennylane

**Date** : 2026-07-20 - **Statut** : accepté (Sekou, 2026-07-20 - validé par un test de bout en bout réel : brouillon créé puis supprimé dans Pennylane de production)

### Contexte

Le module de facturation des honoraires syndic de la solution PowerApps `MYTHEC_REAL31_Automation` (5 prestations ponctuelles : dépassement CS, suivi de travaux, suivi de sinistre, pré-état daté, état daté) devait être réimplémenté dans l'intranet. L'audit (dépôt `mythec-refactor`, `powerapps/MIGRATION_PLAN.md`) a mis au jour plusieurs défauts du legacy qu'il fallait décider de reproduire ou de corriger, et plusieurs pièges de données qui auraient produit des montants faux.

### Décision

**Tables natives `public.intranet_*`, pas de schéma dédié.** `intranet_tarifs`, `intranet_suivi_contrats`, `intranet_factures`, `intranet_facture_lignes` (+ `intranet_recap_ag`, `intranet_recap_ag_travaux` pour la suite). Le dossier `supabase/migrations/` (schéma `real31_intranet`) n'a jamais été déployé sur la base cible `suivi-contrats-copros` et est abandonné depuis la décision du 2026-06-10 : les tables natives vivent dans `public` avec préfixe `intranet_`, référence **logique** vers `public."Copropriete"` (aucune FK, pour ne rien imposer à Prisma), RLS off, exécution manuelle des `.sql` dans le SQL editor.

**Le montant n'est jamais saisi ni transmis par le client : il est recalculé serveur depuis le barème.** Le legacy (`REALFacturationSyndic`) reprenait tel quel le montant calculé côté PowerApps. Ici, le calcul vit dans `lib/domain/facturation/` (fonctions pures, testées), les services résolvent le barème puis appellent le domaine. L'aperçu de confirmation et la création partagent **le même appel** (`apercuXxx` / `creerFactureXxx`), ils ne peuvent pas diverger.

**Un tarif absent du barème lève une erreur explicite.** Côté PowerApps, un `LookUp` infructueux remontait `blank`, traité comme 0 par la somme : une prestation sans tarif était facturée 0 € sans alerte. `exigerTarifTtc` (`services/facturation/bareme.ts`) refuse et nomme l'année manquante.

**Une facture sans ligne est refusée.** Le cas « suivi de sinistre sans aucune diligence retenue » aurait produit une facture Pennylane à 0 ligne. Le domaine lève (`calculerHonorairesSinistre`), l'écran de validation l'explique avant.

**`draft: true` non négociable.** Aucune facture n'est jamais finalisée automatiquement : la validation reste un geste humain côté comptabilité. Le jeton Pennylane vient de `PENNYLANE_API_KEY` (environnement), **jamais** d'une table applicative - le legacy le stockait en clair dans la liste SharePoint « Paramètres ».

**Résolution du client Pennylane en deux temps.** `Copropriete.pennylaneId` est un UUID, c'est une `external_reference`, pas l'`id` interne Pennylane. L'adapter fait `GET /customers?filter=[{external_reference eq ...}]` puis utilise l'`id` retourné comme `customer_id`, exactement comme le flow legacy. Vérifié en réel sur 5 copropriétés.

**Écran de validation systématique avant tout envoi.** Les 5 prestations passent par un récapitulatif commun (`ApercuFacturation`) : critères retenus, ce qui est couvert par le contrat, ce qui est en dépassement, montant HT/TTC. Confirmation = création **et** émission enchaînées. L'historique (`intranet_factures`) remplace la file d'attente, avec réémission possible d'un échec.

### Pièges de données relevés (et neutralisés)

- **`Copropriete.csDurationMinutes` contient des HEURES**, malgré son nom. Relevé sur 265 copropriétés : valeurs 0/1/2/3, dont 217 à la valeur 1. Diviser par 60 aurait ramené la franchise de 1 h à 1 minute et fait facturer **presque toute réunion de CS en totalité**.
- **`Copropriete.realPostalFees` est un booléen**, pas un montant : le forfait postaux n'est pas récupérable là.
- La convention monétaire est **TTC en base** (`intranet_tarifs.montant_ttc`), le HT facturé valant TTC / 1,2. Corroboré à l'import : plusieurs tarifs donnent un HT rond (AGE -> 34,00 / CSSupp -> 190,00 / PreEtatDate -> 245,00).
- Le champ `description` d'une ligne Pennylane est **ce qui s'affiche sur le PDF** : il porte le détail horaire complet (début, fin, durée retenue, inclus au contrat, facturable), sans quoi la facture est injustifiable devant un conseil syndical.
- Le schéma « Draft Customer Invoice » exige `deadline`, `currency` et `language` : sans eux, Pennylane rejette en `400 NotAnyOf`.

### Conséquences

**Positives**

- Les montants ne peuvent plus être faussés par une saisie, un tarif manquant ou une divergence entre l'aperçu et la facture.
- Les échecs d'émission sont tracés (`statut`, `pennylane_error`) et rejouables : le legacy n'avait aucune gestion d'erreur sur ce flux.
- Le calcul métier est isolé et testé hors de toute infrastructure (domaine pur, sans Zod ni `Date`).

**Négatives**

- `intranet_suivi_contrats` est reconstitué par déduction depuis `Copropriete.syndicContractEndDate` (contrat courant = fin - 1 an + 1 jour), faute de reprise de la liste SharePoint « Suivi des contrats copro ». Les montants d'honoraires y sont donc NULL, ce qui **bloque la facturation de gestion courante**.
- La grille tarifaire **2024** est incomplète : 11 copropriétés lèveront une erreur sur les prestations autres que le dépassement horaire.
- Les **Produits** Pennylane (`product_id`, `ledger_account_id`) ne sont pas repris : les lignes partent sans rattachement au plan comptable.
- PostgREST ne permet pas de transaction multi-tables : si l'insertion des lignes échoue après la facture, celle-ci reste sans ligne (erreur remontée, jamais de facture partiellement facturée). À durcir via une fonction SQL si le besoin devient réel.

### Liens

- Audit source : `mythec-refactor/powerapps/INVENTORY.md` et `MIGRATION_PLAN.md`.
- **ADR-012** (génération de documents, bloque le contrat de syndic), **ADR-011** (RLS), **ADR-001** (ports & adapters).
- SQL : `supabase/sql/intranet_facturation.sql`, `intranet_recap_ag.sql`, `intranet_tarifs_seed.sql`, `intranet_suivi_contrats_seed.sql`.
- Smoke de bout en bout : `src/lib/services/facturation/facturation-e2e.smoke.ts` (écritures réelles, lancement manuel).

---

## Décisions futures à formaliser (placeholders)

Sujets non tranchés, qui feront l'objet d'ADRs ultérieurs :

- **ADR-014** : UI library (shadcn/ui + Radix vs Mantine vs autre)
- **ADR-015** : ORM / data access Supabase (drizzle vs prisma vs supabase-js + types générés)
- **ADR-016** : Validation runtime (Zod vs Valibot)
- ~~**ADR-017** : Auth library~~ -> **tranché** (Auth.js v5), cf. section ADR-017 ci-dessus.
- **ADR-018** : Strategie de devenir des données historiques SharePoint post-migration (cf. ADR-003)
- **ADR-019** : Stratégie de tests (vitest, Playwright, contract tests sur adapters)
- **ADR-020** : Observabilité (Sentry, Vercel Analytics, Logflare, ...)

À traiter au moment où la décision devient bloquante.

> Note de numérotation : ADR-021 (plateforme unifiée) a été formalisé en premier, hors de cette liste, le 2026-05-27. Les numéros 014 à 020 restent réservés aux sujets ci-dessus pour ne pas casser les renvois existants (notamment ADR-015 ORM, référencé par ADR-021).
