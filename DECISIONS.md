# DECISIONS.md — Architectural Decision Records

Ce document trace les décisions d'architecture significatives du projet
**REAL31 Intranet**. Chaque entrée suit un format ADR léger : **contexte →
décision → conséquences**. Une décision n'est pas figée pour l'éternité — si
on la révise, on **ajoute** un nouvel ADR qui supersede l'ancien. Pour les
révisions mineures (enrichissement à la lumière de nouveaux faits), on
met à jour l'ADR existant et on incrémente la version dans son entête.

**Légende statut** : Proposed · Accepted · Deprecated · Superseded by ADR-XXX

---

## Index

| # | Titre | Statut | Version | Date |
|---|---|---|---|---|
| ADR-001 | Pattern d'abstraction des sources de données (Ports & Adapters) | Accepted | v2 | 2026-05-22 |
| ADR-002 | Stratégie de cache et fraîcheur des données | Accepted | v2 | 2026-05-22 |
| ADR-003 | Migration progressive SharePoint → eStale | Accepted | v2 | 2026-05-22 |
| ADR-004 | Jobs, cron et orchestration | Accepted | v1 | 2026-05-22 |
| ADR-005 | Authentification eStale et transition vers API key | Accepted | v1 | 2026-05-22 |
| ADR-006 | Système de jalons à deux étages (légal + REAL31) | Accepted | v2 | 2026-05-22 |
| ADR-007 | Audit RGPD niveau (b) + séparation audit/activity log | Accepted | v2 | 2026-05-22 |
| ADR-008 | Périmètre fonctionnel — surcouche de coordination eStale | Accepted | v1 | 2026-05-22 |
| ADR-009 | Permissions et scopes — gestionnaire cloisonné au MVP, modèle extensible | Accepted | v1 | 2026-05-22 |
| ADR-010 | Identification utilisateurs — mapping initiales Crypto ↔ email Entra ID | Accepted | v1 | 2026-05-22 |
| ADR-011 | RLS Supabase activée dès J1, complexification par ajout de policies | Accepted | v1 | 2026-05-22 |
| ADR-012 | Génération PDF reportée post-MVP + retrait du deep-link Crypto | Accepted | v1 | 2026-05-22 |
| ADR-013 | Géocodage des adresses via Nominatim OSM dans le job de sync | Accepted | v1 | 2026-05-22 |

---

## ADR-001 — Pattern d'abstraction des sources de données

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : enrichissement de la liste des types métier suite à analyse du mockup. Pas de changement structurel.

### Contexte

Pendant un minimum de 6 mois, l'application doit lire **trois sources hétérogènes en parallèle** :

1. **SharePoint** (Microsoft Graph API) — 164 copros, données exportées manuellement depuis Crypto/Septeo.
2. **eStale** (GraphQL) — 4 copros pilotes au démarrage, 168 à terme.
3. **Supabase** — données métier natives à l'intranet (jalons, alertes, notes, audit logs, présences pré-AG, historique d'actions, conformité…).

À terme, eStale deviendra la seule source externe. **L'architecture doit pouvoir débrancher SharePoint sans toucher aux pages, composants, ou règles métier.**

Le piège à éviter : un `getCopros()` global qui contiendrait des `if (source === 'estale')` éparpillés. Code qui pourrit, migration douloureuse, fuites de l'API SharePoint dans les composants React.

### Décision

On adopte une **architecture hexagonale (Ports & Adapters)**, version pragmatique. Trois couches strictes :

1. **Domaine** (`lib/domain/`) — Types TypeScript purs, zéro dépendance technique. Les règles métier (décret 1967, calcul des jalons) vivent ici.

2. **Ports** (`lib/ports/`) — Interfaces TypeScript : `CoproRepository`, `EvenementRepository`, `JalonRepository`, etc. Le code applicatif ne connaît **que ça**.

3. **Adapters** (`lib/adapters/`) — Implémentations concrètes :
   - `lib/adapters/sharepoint/` — utilise Microsoft Graph
   - `lib/adapters/estale/` — utilise le client GraphQL
   - `lib/adapters/supabase/` — utilise supabase-js
   - `lib/adapters/mock/` — pour développement local et tests

Un **routeur** (`lib/adapters/router.ts`) instancie le bon adapter selon le champ `copros.source` en base. Le routage est par-entité, pas global.

### Types métier (recensement complet post-mockup)

Données provenant des sources externes (SharePoint ou eStale) :
- `Copropriete` — référentiel copros (code, nom, adresse, gestionnaire, lots, tantièmes…)
- `Evenement` — type discriminé : `AG | AGE | CS | Visite | Travaux`. Sourcé externe pour la définition de base (date, lieu, copro).

Données **natives à l'intranet** (Supabase uniquement) :
- `Jalon` — lié à un événement de type AG/AGE. Champs : `type`, `cible_date`, `realise_date`, `statut ∈ {a_faire, accompli, en_alerte}`, `commentaire`, `marque_par_user_id`. Le jalon **n'existe pas** dans Crypto/eStale.
- `ItemODJ` — item d'ordre du jour d'une AG. Champs : `ordre`, `libelle`, `regle_majorite ∈ {art24, art25, art26, unanimite, sans_vote}`.
- `ConformiteCopropriete` — calcul de la fiche conformité : `ag_a_jour`, `pas_de_retard_legal`. Pour le MVP, seul `ag_a_jour` est calculé (cf. ADR-008).
- `MembreConseilSyndical` — nom, rôle (`president | membre`), date de fin de mandat. Saisie manuelle.
- `PresencePreAG` — compteurs avant l'AG : `presents_prevus`, `pouvoirs_recus`, `votes_correspondance_recus`, `total_lots`. Saisie manuelle.
- `HistoriqueAction` — "FS a marqué X comme accompli". Écrit dans `activity_log` (cf. ADR-007).
- `Alerte` — alerte calculée et son état de traitement (lue/résolue par qui, quand).
- `User`, `GestionnaireMapping` — identité et permissions (cf. ADR-009, ADR-010).

### Conséquences

**Positives**
- Migration eStale = supprimer `SharePointCoproAdapter` + retirer la valeur `'sharepoint'` de l'enum `source`. Zéro impact UI.
- Tests : on injecte `MockCoproAdapter` partout, plus besoin de mocker `fetch` ou Graph SDK.
- L'abstraction reste utile **même sans eStale** (mocks, séparation propre, testabilité).

**Négatives**
- Boilerplate au démarrage (interfaces + 4 adapters).
- Tentation de fuites : il faut être **discipliné**.

**Règle d'or non négociable** : aucun import direct de `@microsoft/microsoft-graph-client`, `graphql-request`, ou `@supabase/supabase-js` en dehors des sous-dossiers `lib/adapters/<source>/`. Cette règle est **lintable** via une règle ESLint (boundaries plugin ou règle custom). À mettre en place dans J1a — increment 1.

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

## ADR-002 — Stratégie de cache et fraîcheur des données

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : clarification explicite "données natives intranet jamais répliquées vers les sources externes". Renforcement de la règle après confirmation par le mockup que toutes les écritures UI concernent du natif.

### Contexte

Trois sources avec des caractéristiques très différentes :
- **SharePoint** : données déjà J-X (export manuel Crypto). Throttling Graph API par tenant. Aucun webhook fiable.
- **eStale** : API GraphQL conçue pour de la lecture live. Rate limit 30 req/s. Session cookie (cf. ADR-005).
- **Supabase** : low latency, requêtes SQL puissantes, on en est propriétaire.

Question : où lit-on, et avec quelle fraîcheur ?

### Décision

**Toutes les pages de l'UI lisent exclusivement Supabase.** Les adapters externes (SharePoint, eStale) ne sont appelés **que par les jobs de synchronisation**, jamais par les requêtes utilisateur.

**Stratégies différenciées par source** :

- **SharePoint → sync miroir nocturne** dans des tables Supabase miroir.  
  Justification : les données sources sont elles-mêmes J-X, lire live n'apporte aucune fraîcheur réelle. Le sync apporte de la résilience aux pannes Graph et la puissance des joins SQL.

- **eStale → read-through cache à TTL court** dans Supabase.  
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
- Risque de désync silencieuse → mitigé par alerting (cf. ADR-004).

### Détails d'implémentation à valider en J3

- Tables miroir Supabase : préfixées `mirror_` (`mirror_copros`, …) pour distinguer des tables natives.
- Chaque ligne miroir porte : `source`, `source_id`, `synced_at`, `etag` ou `last_modified` pour delta sync.
- Job SharePoint = **upsert** par `(source, source_id)`. Soft delete via `archived_at`.

---

## ADR-003 — Migration progressive SharePoint → eStale

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
- L'UI doit savoir afficher ce badge → exposer `copros.source` via le repository.
- Le bouton **"Ouvrir dans X"** est conditionnel : si `source = 'estale'`, on construit l'URL `{ESTALE_DEEPLINK_BASE}/copro/{source_id}`. Si `source = 'sharepoint'` (alias "Crypto" côté UI), le bouton est **absent** car Crypto n'est pas deep-linkable (cf. ADR-012).
- Nomenclature UI : `'sharepoint'` côté technique → affiché `Crypto` côté utilisateur (c'est la source perçue par eux). `'estale'` → `eStale`.

### Conséquences techniques

**Positives**
- Migration testable copro par copro.
- Si une copro eStale pose problème, on la repasse `source = 'sharepoint'` en un click.
- Audit trail clair via `audit_log`.

**Négatives**
- Possible incohérence transitoire après bascule. Mitigation : le job SharePoint **vérifie `source` au moment du run**, pas au moment de la planification.

### Question ouverte

Sort des données SharePoint quand la migration sera totalement terminée — suppression / archivage / conservation. À trancher dans un futur ADR avant la fin de la migration.

---

## ADR-004 — Jobs, cron et orchestration

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Plusieurs besoins d'exécution en arrière-plan :
- Sync nocturne SharePoint (~164 copros)
- Sync incrémental eStale (read-through cache)
- Alertes mail (J-90, J-60, J-30 sur contrats ; jalons AG en retard ; synthèse hebdo) — post-MVP
- Détection d'anomalies (post-MVP)

**Vercel = serverless = stateless**, pas de scheduler en mémoire.

### Décision

**Phase MVP (J1-J4) — Vercel Cron uniquement.**
- 1 cron `sync-sharepoint-nightly` (3h du matin)
- 1 cron `refresh-estale-stale-entries` (toutes les heures)

**Phase Alertes (J5) — Introduction d'Inngest** pour workflows durables, retry, idempotence, dashboard.

### Principe transversal : jobs portables

Tous les jobs sont des **fonctions TypeScript pures**, appelables :
1. Via Vercel Cron (handler API route)
2. Via Inngest (function declaration) — phase 2
3. **Via CLI** (`pnpm sync:sharepoint`) — critique pour dev local et debug prod.

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
- Alerting : si un cron critique n'a pas tourné depuis 36h → notification mail manager.

### Alternatives rejetées

- **Supabase `pg_cron`** : OK pour SQL pur, pas pour appels HTTP externes.
- **QStash** : bon, mais moins d'observabilité qu'Inngest pour workflows complexes.
- **GitHub Actions cron** : latence élevée, pas d'intégration avec le code de prod.

---

## ADR-005 — Authentification eStale et transition vers API key

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

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

**Transition future (API key)** :
- L'adapter eStale expose `lib/adapters/estale/auth/` avec deux clients :
  - `session-cookie-client.ts` (actuel)
  - `api-key-client.ts` (futur)
- Code applicatif appelle uniquement `getEstaleClient()`.
- Bascule = variable d'env `ESTALE_AUTH_METHOD=api-key` + remplir la nouvelle classe.

### Critère de réévaluation

Si l'API key n'est pas disponible à **2026-11-22**, rouvrir cet ADR.

### Sécurité

- Credentials eStale **jamais** côté navigateur.
- Logs : ne **jamais** logger le cookie ni le mot de passe.

---

## ADR-006 — Système de jalons à deux étages (légal + REAL31)

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
- Rouge : dépassement légal → alerte mail immédiate + entrée `audit_log` de niveau `LEGAL_VIOLATION`

### 5 jalons MVP (confirmés par mockup)

Pour une AG/AGE :
| Ordre | Jalon | Cible | Source |
|---|---|---|---|
| 1 | ODJ validé avec CS | J-45 | Cabinet REAL31 |
| 2 | Devis et documents techniques rassemblés | J-45 | Cabinet REAL31 |
| 3 | Convocations envoyées | J-21 | **Légal — art. 9 décret 1967** |
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

## ADR-007 — Audit RGPD niveau (b) + séparation audit / activity log

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v2

> v2 : ajout de la séparation `audit_log` (RGPD) vs `activity_log` (UI feature). Validée après analyse du mockup qui montre un fil d'historique d'actions affiché à l'utilisateur.

### Contexte

Le projet manipule des **données personnelles de copropriétaires**. Un syndic peut être accusé de constituer un fichier illicite si les accès ne sont pas tracés.

Le mockup montre par ailleurs un **historique d'actions affiché dans l'UI** (« FS a marqué X comme accompli le 5 mai »). Cette feature produit est **distincte** de l'audit RGPD.

### Décision

**Deux tables distinctes**, deux usages distincts.

#### `audit_log` — conformité RGPD

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

#### `activity_log` — feature produit (historique affiché)

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

- **Lecture user-facing** : requêté par les pages "Fiche prépa AG → Historique des actions", "Mes événements → Activité récente"
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

## ADR-008 — Périmètre fonctionnel : surcouche de coordination eStale

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

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
4. **Génération de documents** (note immeuble, ODJ, convocations, courriers) — post-MVP
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
- Risque de demande de duplication ("affiche-moi le solde compta ici aussi") — à refuser sauf cas marginal.

**Règle de gouvernance** : toute proposition de feature qui dupliquerait une fonctionnalité existant dans eStale doit déclencher la question : *"pourquoi ne pas le faire dans eStale ?"*. Réponse acceptable uniquement si la valeur ajoutée est dans la **coordination ou la transversalité** (ex. comparer le solde de 10 copros d'un coup → c'est de la coordination, ça peut entrer).

### Conséquence sur les profils utilisateurs

Il n'y a **pas 6 écrans différents pour 6 rôles métier**. Il y a **une seule UI** (la vue gestionnaire du mockup), avec des **périmètres de visibilité** différents selon le rôle. Cf. ADR-009.

---

## ADR-009 — Permissions et scopes : gestionnaire cloisonné au MVP, modèle extensible

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

MVP : 4-7 gestionnaires, chacun voit uniquement ses copros (cloisonnement strict).

Vision long terme :
- Dirigeant, directeurs syndic → voient toutes les copros (ou celles de leur direction)
- Comptables → voient toutes les copros (pour coordination avec gestionnaires)
- Assistants → voient les copros de leur gestionnaire référent
- Collègues d'autres services → accès lecture selon besoin

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

| Rôle | Scope | Implémentation |
|---|---|---|
| `gestionnaire` | "mes copros" | `copros.gestionnaire_initials = users.gestionnaire_initials` |
| `assistant` | "copros de mon gestionnaire" | via `reports_to_user_id` (post-MVP) |
| `comptable`, `directeur`, `dirigeant` | "toutes les copros" | pas de filtre |
| `admin` | "toutes + admin" | pas de filtre + accès aux pages admin |

**Au MVP, seul le scope `gestionnaire` est activé.** Les autres rôles existent dans l'enum mais aucune politique RLS ne leur donne accès → en pratique ils ne voient rien tant qu'on n'ajoute pas la policy correspondante.

### Conséquences

**Positives**
- Extensibilité par **ajout** de policies RLS, pas par refonte (cf. ADR-011).
- L'UI ne change pas selon le rôle, juste les données retournées.
- Audit log inclut déjà `actor_role` → traçabilité dès J1, utile post-MVP.

**Négatives**
- Plus de colonnes "inutilisées" au MVP (`reports_to_user_id`, autres rôles).
- Tentation de coder des features par rôle plus tôt — à refuser.

### Anti-pattern à éviter

**Ne PAS** coder un système de permissions custom dans l'app (genre `if user.role === 'gestionnaire' && copro.gestionnaire === user.initials`). Toute la logique de scope passe par RLS Supabase (cf. ADR-011). L'app fait confiance aux requêtes — si Supabase ne retourne pas une ligne, c'est qu'on n'y a pas droit.

---

## ADR-010 — Identification utilisateurs : mapping initiales Crypto ↔ email Entra ID

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Les exports Crypto identifient le gestionnaire d'une copro par **initiales** (ex. `FS`, `KN`). L'authentification se fait via **Entra ID** qui retourne un **email** (`francois.sergent@real31.fr`).

Il faut une correspondance entre les deux.

### Décision

**Table de mapping native Supabase**, saisie une fois à la main par un admin.

Cette table n'est pas une entité séparée — c'est le champ `users.gestionnaire_initials` introduit dans ADR-009. Le mapping est porté directement par la table `users`.

#### Process de bootstrap

1. Le job de sync SharePoint extrait la liste d'**initiales uniques** vues sur le terrain (colonne `Gestionnaire`).
2. La liste est exposée sur une page admin `/admin/users` avec :
   - Les initiales connues côté SharePoint
   - Les users existants côté `users`
   - Les initiales non encore mappées (orphelines)
3. L'admin crée manuellement le user (`email Entra ID` + `display_name` + `gestionnaire_initials`).

#### Process au login

1. User se connecte via Entra ID → token avec email.
2. App cherche `users.email = <email>` :
   - Trouvé et `is_active = true` → session OK, sa `gestionnaire_initials` est en cookie.
   - Pas trouvé ou inactif → page "Accès non autorisé, contacter l'admin".
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

## ADR-011 — RLS Supabase activée dès J1, complexification par ajout de policies

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

Mêmes patterns pour `evenements`, `jalons`, `activity_log`, etc. — toujours via une jointure sur `users`.

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

PostgreSQL combine les policies en OR — le user voit la ligne si **au moins une** policy le permet. Pas de refonte.

### Tests obligatoires

- Tests de policies : un user gestionnaire connecté tente de lire une copro qui n'est pas la sienne → 0 lignes retournées (pas 403, juste vide).
- Tests d'escalade : tentative de modifier `users.role` depuis l'app utilisateur → bloqué.

### Conséquences

**Positives**
- Sécurité défense-en-profondeur : même si une route oublie un filtre, RLS bloque.
- Extensibilité = ajout de policies, jamais refonte.
- Le code applicatif ignore les permissions → simpler.

**Négatives**
- Courbe d'apprentissage RLS (syntaxe Postgres, debug parfois opaque).
- Performance : RLS ajoute du WHERE implicite sur chaque requête. Pour notre volumétrie (168 copros), négligeable. À monitorer post-MVP si on dépasse les 10k lignes par table.

### Anti-pattern à éviter

Ne PAS désactiver RLS pour le service role et faire toute la logique côté Server Action. C'est tentant pour les Server Actions, mais ça contourne la défense. **Règle** : même les Server Actions tapent Supabase avec le client `auth-context-aware`, pas avec le service role, **sauf** pour les jobs cron (qui passent explicitement par le service role).

---

## ADR-012 — Génération PDF reportée post-MVP + retrait du deep-link Crypto

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Le mockup affiche des boutons de génération de documents (convocations PDF, ODJ PDF, note immeuble, impression du calendrier annuel). Ces fonctions sont visuellement présentes mais non triviales à implémenter en serverless.

Par ailleurs, le mockup montre un bouton "Ouvrir dans Crypto" — or Crypto est un logiciel desktop legacy non deep-linkable.

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
- Promesse implicite à tenir post-MVP — à inscrire en haut de la backlog vague 2.

### Conditions de réouverture

Si la génération de convocations devient critique avant la vague 2 (ex. trop de friction Crypto), on **ouvre un nouvel ADR** avec étude comparative Puppeteer / react-pdf / service externe (DocRaptor, PDFShift). Sinon, on attend.

---

## ADR-013 — Géocodage des adresses via Nominatim OSM dans le job de sync

**Date** : 2026-05-22 · **Statut** : Accepted · **Version** : v1

### Contexte

Le mockup affiche une **mini-carte Leaflet** sur la fiche copro. Pour positionner le marker, il faut des coordonnées géographiques (latitude/longitude).

Les sources externes (SharePoint export Crypto, eStale) stockent l'adresse en texte libre, pas les coordonnées (à confirmer pour eStale).

### Décision

**Géocodage des adresses via Nominatim OSM (gratuit), exécuté dans le job de sync nocturne.**

- Lat/lng stockées en colonnes `copros.lat` et `copros.lng`.
- Géocodage UNIQUEMENT au premier sync d'une copro, ou si l'adresse change (détectée par diff).
- Rate limit Nominatim : 1 req/sec officiel. Sur 168 copros, premier sync = ~3 min de géocodage. Acceptable nocturne.
- Cache permanent en base (les copros déménagent rarement).
- Fallback en cas d'échec : adresse non géocodable → carte non affichée, message "Localisation indisponible". Pas d'erreur applicative.

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

| Service | Pourquoi rejeté |
|---|---|
| MapBox Geocoding | Payant au-delà du free tier (50k req/mois — overkill). Clé API à gérer. |
| OpenCage | Payant, 2500 req/jour gratuit, overkill. |
| Google Geocoding | Payant, gestion clé API stricte. |
| ban.openstreetmap.fr (BAN officielle) | Excellent pour FR, à reconsidérer post-MVP si Nominatim insuffisant. |

### Conséquences

**Positives**
- Zéro coût, zéro clé à gérer.
- Couverture suffisante pour Toulouse + agglo.
- Si Nominatim down un soir, le sync continue (échec géocodage = lat/lng restent vides, on réessaye au prochain sync).

**Négatives**
- Qualité géocodage parfois inférieure à Google/MapBox (rare en zone urbaine).
- Latence non garantie (service communautaire).
- Si REAL31 s'étend à des zones rurales, qualité à revérifier.

### Critère de réévaluation

Si > 5 % des adresses ne sont pas géocodables avec Nominatim → migrer vers BAN ou MapBox.

---

## Décisions futures à formaliser (placeholders)

Sujets non tranchés, qui feront l'objet d'ADRs ultérieurs :

- **ADR-014** : UI library (shadcn/ui + Radix vs Mantine vs autre)
- **ADR-015** : ORM / data access Supabase (drizzle vs prisma vs supabase-js + types générés)
- **ADR-016** : Validation runtime (Zod vs Valibot)
- **ADR-017** : Auth library côté Next.js (Auth.js v5 vs implémentation custom OAuth Entra)
- **ADR-018** : Strategie de devenir des données historiques SharePoint post-migration (cf. ADR-003)
- **ADR-019** : Stratégie de tests (vitest, Playwright, contract tests sur adapters)
- **ADR-020** : Observabilité (Sentry, Vercel Analytics, Logflare, …)

À traiter au moment où la décision devient bloquante.
