# Audit performance & sécurité - REAL31 Intranet (2026-06-29)

Synthèse de 4 audits multi-agents (sécurité, performance app, base de données, architecture) sur la branche `increment/02-supabase`. Lecture seule. Les chemins sont relatifs à la racine du repo.

> **À valider patron/DSI** : les actions marquées 🔑 touchent la base partagée App A ou l'Entra ID → ne pas appliquer sans Sekou.

---

## Cause racine (en une phrase)

L'architecture hexagonale est **saine et disciplinée**, mais elle repose sur **deux choix structurants non finis** qui concentrent tout le risque et toute la lenteur :

1. **Sécurité** : toute la donnée passe par `service_role` Supabase (RLS court-circuitée) → le cloisonnement est **100 % réimplémenté en code** (`filtrePerimetre`, `coproAppartient`). Une seule omission de garde = fuite de données copropriétaires (RGPD). Le RLS documenté (ADR-011) protège un schéma `real31_intranet` **vide** ; la vraie donnée vit dans `public`.
2. **Performance** : **zéro cache** (toutes les pages `force-dynamic`), et des **ré-authentifications + appels réseau répétés** (session Auth.js, token Graph, eStale séquentiel) non mémoïsés. Le read-through cache eStale promis par l'ADR-002 **n'est pas implémenté**.

---

# PARTIE 1 - SÉCURITÉ

### 🔴 C1 (CRITIQUE) - App Entra sur-privilégiée : un secret qui fuite = compromission du tenant
`src/lib/adapters/mail/graph-auth.ts` (usage du secret).
Le token applicatif porte, en plus de `Mail.Read/ReadWrite/Send`, **`Application.ReadWrite.All`** + **`AppRoleAssignment.ReadWrite.All`** - **inutilisés dans le code**. Si `AUTH_MICROSOFT_ENTRA_ID_SECRET` fuit (logs, dump env, poste volé, compromission Vercel), l'attaquant peut s'auto-octroyer **toutes** les permissions Graph et prendre le contrôle du **tenant M365 entier** (toutes les boîtes, SharePoint, Entra). On passe de "lecture des mails" à "prise de contrôle".
**Correctif** : 🔑 DSI - retirer ces 2 rôles (Azure → App → API permissions → Remove + admin consent). Ne garder que Mail.*. **Effort S, impact maximal.**

### 🔴 C2 (CRITIQUE) - Sans Application Access Policy, le token lit/envoie depuis TOUTE boîte du tenant
`src/app/mes-emails/actions.ts` (envoyerReponseAction), `graph-mail-outbound.ts`, `graph-mailbox.ts`.
Le cloisonnement de boîte repose uniquement sur `g.email` passé en paramètre + une Application Access Policy Exchange **dont l'existence n'est pas garantie par le repo**. Si la policy manque/mal scopée, `Mail.Send`/`Mail.ReadWrite` peut envoyer et lire **n'importe quelle boîte**.
**Correctif** : 🔑 confirmer/documenter `New-ApplicationAccessPolicy` (groupe des 40 boîtes) + test : lire une boîte hors groupe doit renvoyer 403. **Effort S.**

### 🟠 E1 (ÉLEVÉ) - Cloisonnement des writes seulement dans les Server Actions, pas dans les adapters
`supabase-supervision-ag-repository.ts` (setStatutItem/setCommentaireItem/conclureAg), `supabase-jalon-repository.ts` (`marquer` - **aucun filtre**).
Les écritures upsert par `(code, ag_date, item_id)` **sans re-vérifier le périmètre** : la seule barrière est `coproAppartient()` dans la Server Action appelante. Un futur appel (cron, nouvelle action) qui oublie la garde écrit cross-portefeuille. Le ROADMAP recense déjà 3 fuites compta corrigées le 2026-06-19 → classe de bugs récurrente.
**Correctif** : déplacer le check de périmètre **dans l'adapter/service** (passer `managerId`, filtrer le upsert) + un wrapper unique `withGestionnaire(action)`. **Effort M.**

### 🟠 E2 (ÉLEVÉ) - Envoi de mail : destinataires non validés, pas de plafond → relais de spam possible
`src/app/mes-emails/actions.ts` (envoyerReponseAction), `graph-mail-outbound.ts`.
Seule validation : `x.includes("@")` (accepte `a@b@c`, `<x>@y`, ` @ `). Aucune limite de nombre de destinataires, aucune journalisation. Un compte compromis (ou un gestionnaire malveillant) peut utiliser l'app comme **relais d'envoi de masse depuis `@real31.fr`** (réputation du domaine engagée).
**Correctif** : vraie validation d'email (regex/zod), **plafond** (~50 destinataires), **journaliser** chaque envoi (qui/quand/combien). **Effort M.** → *quick win partiel implémenté ce soir (validation + plafond).*

### 🟠 E3 (ÉLEVÉ) - Aucune validation de schéma sur les Server Actions
Transverse (`mes-emails/actions.ts`, `supervision-ag/[id]/actions.ts`, `coffre/actions.ts`).
Les Server Actions sont des **endpoints POST publics**. Aucun `zod`. `coproNom`/`dossierLabel`/`folderNom` écrits **sans longueur max** (pollution base) ; `type` (TypeDossier) **non validé au runtime** → `MODELES_ETAPES[type]` crash possible sur enum hors-bornes.
**Correctif** : `zod` (ou validation manuelle) en tête de chaque action (format, longueurs, enums). **Effort M.**

### 🟡 M1 (MOYEN) - Fragilité du double `.or()` PostgREST (cloisonnement)
`supabase-copro-repository.ts` (findByCode, setDateEvenement).
Le AND de deux `.or()` est **exact mais dépendant de la lib** : une régression `supabase-js` ou un refactor peut transformer le AND en OR → **cloisonnement silencieusement cassé** (chacun voit toutes les copros).
**Correctif** : test d'intégration verrouillant le comportement + cible RLS. **Effort M.**

### 🟡 M2 (MOYEN) - `echapperHtml` incomplet + citation HTML ré-émise sans assainissement
`graph-mail-outbound.ts`. Risque XSS **faible dans l'app** (pas de `dangerouslySetInnerHTML`, vérifié). La citation du mail d'origine (HTML tiers) est ré-émise telle quelle (risque réputationnel/spam, pas compromission).
**Correctif** : ajouter `"` et `'` à `echapperHtml`. **Effort S.** → *implémenté ce soir.*

### 🟡 M3 (MOYEN) - PII dans les logs serveur
`get-mes-emails.ts`, `synchroniser.ts`, `graph-mailbox.ts`, **`noop-mail-outbound.ts` (logge les adresses destinataires)**.
Codes copro, ids mail et surtout **adresses email** partent dans les logs Vercel (rétention, accès élargi) → RGPD.
**Correctif** : ne logger que des compteurs/ids techniques, retirer `p.a.join(", ")`. **Effort S.** → *implémenté ce soir.*

### 🟡 M4 (MOYEN) - Impersonation sans journalisation + auth pas "fail-closed"
`src/lib/auth/session.ts`, `dev-login/actions.ts`.
(a) Un super-admin peut agir "en tant que" n'importe qui (envoyer des mails, modifier) **sans aucune trace**. (b) Si `ssoConfigure` passe à `false` en prod (var Entra absente/mal déployée), `impersonationAutorisee()` renvoie `true` pour **tout le monde** → un mauvais déploiement **ouvre l'app**.
**Correctif** : journaliser l'impersonation + garde-fou : en `production`, si `!ssoConfigure` → **refuser** (fail-closed). **Effort M.**

### 🟢 FAIBLE
- **F1** : confirmer `git ls-files data/ .env*` = vide (un fichier PII commité **avant** la règle `.gitignore` resterait tracké). → *vérifié ce soir.*
- **F2** : `emailId` client non re-validé contre le triage (borné à `g.email`, donc pas de fuite cross-user ; dépend de C2).
- **F3** : coffre `azureOid = g.id` (managerId) au lieu du vrai OID Entra - couplage trompeur.

### ✅ Points sains à conserver
`service_role` jamais en `NEXT_PUBLIC_` · `.gitignore` PII complet · `coproAppartient`/`filtrePerimetre` cohérents sur la majorité des écritures · coffre zero-knowledge correctement gardé · pas de `dangerouslySetInnerHTML` · identité d'impersonation résolue serveur · ESLint `boundaries` actif en `error`.

---

# PARTIE 2 - PERFORMANCE

## Cause racine : zéro cache + appels répétés/séquentiels

### 🔵 P-A1 (FORT) - `getGestionnaireCourant()` + `auth()` appelés plusieurs fois par requête
`src/lib/auth/session.ts`, `src/components/layout/app-shell.tsx`.
Chaque page lit la session (page + `AppShell.impersonationAutorisee()`) → `auth()` ≥2× + 1 requête DB `User` par requête HTTP.
**Correctif** : mémoïser `getGestionnaireCourant` et `emailSso` avec `React.cache()` (2 lignes). **Effort S.** → *implémenté ce soir.*

### 🔵 P-A2 (FORT) - Token Graph re-négocié à chaque Server Action mail
`src/lib/adapters/mail/graph-auth.ts`. POST OAuth2 à Microsoft (400-600 ms) à **chaque** appel mail ; le token vit 3600 s mais n'est pas caché (contrairement au cookie eStale).
**Correctif** : cache module-level (TTL = `expires_in` - 60 s). **Effort S.** → *implémenté ce soir.*

### 🔵 P-A3 (FORT) - Waterfalls séquentiels (dashboard, fiche copro)
`get-dashboard.ts` : `getEtats`/`getProblemes`/`getActionsDossiers` indépendants mais **en série** → `Promise.all` (gain ~200-400 ms).
`get-fiche-copro.ts` : eStale + événements + jalons + compta en série.
**Correctif** : `Promise.all` sur les appels indépendants. **Effort S-M.** → *dashboard implémenté ce soir.*

### 🔵 P-A4 (FORT) - eStale : 5-6 queries GraphQL séquentielles par copro + pas de read-through cache
`estale-condo-provider.ts` (getDonneesCopro), `get-mes-emails.ts` (enrichirContextes : N copros).
Une fiche froide = plusieurs secondes ; N mails rattachés = N×4-6 appels eStale. Le cache module-10min sur la *liste* des condos ne survit pas aux cold starts Vercel.
**Correctif** : (court) `Promise.all` des appels internes ; (fond) implémenter le **read-through cache eStale d'ADR-002** (table `mirror_*` Supabase TTL court, robuste en serverless). **Effort M → L.**

### 🔵 P-A5 (FORT) - `force-dynamic` sur les 12-17 pages, aucun cache de rendu
Pages référentiel-only (calendrier, liste copros, ODJ passé, résolutions) refont tout à chaque visite.
**Correctif** : passer ces pages en `revalidate` court (60-300 s, ISR) ; garder `force-dynamic` seulement sur dashboard/supervision (+ `unstable_cache` sur les lectures lourdes). **Effort S-M.**

## Index manquants (base de données)

> 🔑 P1/P2 touchent les tables App A (schéma Prisma `public`) → **valider avec le patron** avant `CREATE INDEX` (CONCURRENTLY = non-bloquant). P3 + bonus = tables natives `intranet_*`, création libre (mais base partagée → prévenir).

```sql
-- P1 🔑 SSO findByEmail (ilike sur User.email -> seqscan a chaque page authentifiee)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_email_lower_idx" ON public."User" (lower(email));

-- P2 🔑 filtrePerimetre + findByCode (seqscan Copropriete sur chaque page)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Copropriete_managerId_idx"   ON public."Copropriete" ("managerId")   WHERE "managerId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Copropriete_assistantId_idx" ON public."Copropriete" ("assistantId") WHERE "assistantId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Copropriete_referenceCrypto_idx" ON public."Copropriete" ("referenceCrypto") WHERE "referenceCrypto" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Copropriete_referenceEstale_idx" ON public."Copropriete" ("referenceEstale") WHERE "referenceEstale" IS NOT NULL;

-- P3 annuaire Crypto (7 589 lignes, lookup email a chaque synchro mail)
CREATE INDEX CONCURRENTLY IF NOT EXISTS intranet_crypto_contacts_email_idx ON public.intranet_crypto_contacts (email);

-- Bonus supervision items "probleme"
CREATE INDEX CONCURRENTLY IF NOT EXISTS intranet_supervision_items_probleme_idx ON public.intranet_supervision_items (copropriete_id) WHERE statut = 'probleme';
```

### Autres perf data
- **P-D5** : `getCoproRepository().list()` appelé sur **11 services** sans cache → `React.cache()` sur un `getCoproprietes(managerId)`. **Effort S.**
- **P-D6** : N+1 `cacheStore.ecrire()` dans la boucle synchro (jusqu'à 80 UPSERTs) → écriture en lot (`ecrireEnLot`). **Effort M.**
- **P-D7** : `select("*")` sur `intranet_mes_emails_etat` (ramène brouillons longs) → colonnes explicites. **Effort S.**
- **P-D8** : `.limit()` absent sur `getEtats` jalons, `listerProblemes`, dossiers, `mes_emails_etat` → **plafond PostgREST silencieux 1000** (le `mes_emails_etat` grossit avec le temps). **Effort S.**
- **P-D9** : `findByCode` fait 2 requêtes séquentielles (referenceCrypto puis referenceEstale) → fusionner en un `.or()` (attention au double-`.or` AND, cf. M1). **Effort S.**
- **P-A6** : composants client monolithiques (`mes-emails-vue.tsx` 1505 l., `coffre-vue.tsx` 1029 l.) → `next/dynamic` sur les panneaux lourds. **Effort M.**
- **P-A7** : `admin.ts` non singleton (impact faible aujourd'hui) ; garde-fou "pas d'I/O en constructeur d'adapter". **Effort S.**

### ✅ Perf saine
Client Supabase **singleton** · cookie eStale caché avec re-login paresseux · `getEtats` jalons en **un `.in()` batch** (pas de N+1) · cache d'analyse lu **en lot** avant la boucle · `getProblemes`/`getActionsDossiers` réutilisent les copros pré-chargées · index composites `(copropriete_id, ag_date)` présents · `select(COPRO_COLS)` explicite (32/62 colonnes).

---

# FEUILLE DE ROUTE PRIORISÉE (3 vagues)

## Vague 1 - Quick wins (code, faible risque, gros gain) - *en partie faits ce soir*
| # | Type | Action | Fichier | Effort |
|---|---|---|---|---|
| 1 | Perf | `React.cache()` sur `getGestionnaireCourant`/`emailSso` | session.ts | S ✅ |
| 2 | Perf | Cache module du token Graph | graph-auth.ts | S ✅ |
| 3 | Perf | `Promise.all` sur le dashboard | get-dashboard.ts | S ✅ |
| 4 | Sécu | Validation + plafond destinataires d'envoi | mes-emails/actions.ts | S ✅ |
| 5 | Sécu | Retirer la PII des logs (`p.a.join`...) | noop-mail-outbound.ts, ... | S ✅ |
| 6 | Sécu | `echapperHtml` += `"` `'` | graph-mail-outbound.ts | S ✅ |
| 7 | Perf | `React.cache()` sur `getCoproprietes` | get-coproprietes.ts | S |
| 8 | Perf | `Promise.all` fiche copro + eStale interne | get-fiche-copro.ts, estale-condo-provider.ts | M |
| 9 | Perf | Pages référentiel en `revalidate` (ISR) | pages `*/page.tsx` | S-M |
| 10 | 🔑 Sécu | DSI : retirer perms Entra excessives (C1) | Azure | S |
| 11 | 🔑 Sécu | Confirmer Application Access Policy (C2) | Exchange | S |
| 12 | 🔑 Perf | Créer les index P1-P3 (valider patron) | base | S |

## Vague 2 - Structurant (semaines)
- **Sécu** : wrapper `withGestionnaire` + checks de périmètre **dans les adapters** (E1/M1) + `zod` sur les Server Actions (E3).
- **Sécu** : durcissement RLS - tables natives `intranet_*` dans `real31_intranet` + pont identité Auth.js→JWT (ADR-011 enfin effectif).
- **Perf** : read-through cache eStale d'ADR-002 (table `mirror_*` / `revalidateTag` par copro) - **plus gros gain perf + résilience pannes**.
- **Sécu/conformité** : implémenter `audit_log`/`activity_log` (ADR-007) + journaliser impersonation & envois mail (M4/E2) + fail-closed auth.
- **Perf** : `withTiming` structuré (eStale + requêtes chaudes) pour **enfin mesurer** la latence.

## Vague 3 - Fond (trimestre, dépend d'externes)
- Sortir les écritures de `public` (App A) au profit d'eStale source primaire (ADR-022) + test de contrat de schéma.
- Découpage des gros composants client (`next/dynamic`).
- Table mirror / pagination du triage `mes_emails` JSONB (P-D8).

---

## TOP 5 absolu (à faire en premier)
1. 🔑 **Retirer les permissions Entra excessives** (C1) - DSI, S, catastrophique si fuite.
2. 🔑 **Confirmer l'Application Access Policy** (C2) - sans elle tout le cloisonnement mail tombe.
3. **`React.cache` session + cache token Graph + `Promise.all` dashboard** (P-A1/A2/A3) - gros gain latence, déjà fait ce soir.
4. 🔑 **Index P1-P2** (User.email lower, Copropriete managerId/assistantId) - supprime des seqscans sur le chemin critique de toutes les pages.
5. **Défense en profondeur cloisonnement** (E1) + validation/plafond envoi (E2) - la seule barrière en service_role.
