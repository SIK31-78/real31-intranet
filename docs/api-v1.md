# API v1 — l'intranet REAL31 apisable (+ serveur MCP « real31 »)

Surface machine de l'intranet : **lecture large** de tout ce que le dashboard sait
(copros, cycle AG, échéances, supervisions, dossiers, compta) et **deux écritures
internes sûres**. Auth par **clé machine** (Bearer), créée dans le panneau
`/admin/cles-api` (réservé super-admin).

> Blueprint d'origine : `docs/audit-preprod-2026-07-06.md` §6. Auth **dans les
> handlers** (`src/lib/auth/cle-api.ts`), jamais dans le proxy Edge (exclu pour
> `/api/v1`, cf. `src/proxy.ts`).

---

## LIGNE ROUGE (non négociable, gravée DECISIONS.md)

L'API et le MCP ne feront **JAMAIS**, quels que soient les scopes :

- **aucune écriture eStale réelle** ;
- **aucun envoi de mail** ;
- **aucune suppression** ;
- **aucun `conclureAg`**, **aucune injection reprise**.

Ces gestes restent derrière le **GO/STOP humain** dans l'UI de l'intranet. Si un
besoin machine émerge un jour : l'API prépare un plan, un humain valide dans l'UI.

---

## Authentification

```
Authorization: Bearer real31_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- La clé (`real31_` + 32 octets aléatoires base64url) est montrée **une seule
  fois** à la création. Seul son **sha256** est stocké (`intranet_api_keys.cle_hash`) ;
  la vérification re-hashe la clé présentée et compare en **timing-safe**.
- **Clé liée à un gestionnaire** (`manager_id`) : la machine « est » ce
  gestionnaire — lectures cloisonnées à son portefeuille, écritures possibles
  (périmètre re-vérifié par les services, anti-IDOR).
- **Clé cabinet** (`manager_id` NULL) : lecture **transverse** seulement.
  **Toute écriture exige une clé liée** (403 `ecriture_exige_gestionnaire`).
- Expiration optionnelle (`expires_at`), révocation à tout moment (`revoked_at`,
  effet immédiat), compteur d'usage journalier (visibilité admin — **pas** un rate
  limit à cette échelle).

### Scopes

| Scope | Donne accès à |
|---|---|
| `lecture` | Toute la surface GET de `/api/v1` |
| `ecriture:supervision` | `POST /supervisions/{agId}/items/{itemId}` |
| `ecriture:compta` | `POST /compta/{code}/{agDate}/notes` |

Aucune implication entre scopes (une écriture n'emporte pas la lecture).

### PII — ce que l'API ne renvoie jamais

Aucune donnée nominative de **copropriétaire** : ni nom, ni email, ni téléphone
d'owner. Concrètement : le conseil syndical nominatif, les débiteurs et la
`cible` des dossiers (nom du copropriétaire) sont **absents** des réponses v1.
Les initiales/noms qui apparaissent (équipe, auteurs) sont des **collaborateurs
REAL31**, pas des copropriétaires.

---

## Conventions

- JSON UTF-8, dates **ISO 8601** (`YYYY-MM-DD`, timestamps `...Z`), IDs stables
  (code copro, `CODE__AAAA-MM-JJ` pour une supervision, uuid pour un dossier).
- **Pagination cursor** sur les listes : `?cursor=&limit=` (limit max **100**,
  défaut 50) ; la réponse porte `total` et `nextCursor` (absent = dernière page).
- Erreur **unique** : `{ok:false, code, message}`.

| HTTP | `code` | Quand |
|---|---|---|
| 401 | `cle_invalide` / `cle_revoquee` / `cle_expiree` | clé absente, inconnue, révoquée, expirée |
| 403 | `scope_manquant` | la clé ne porte pas le scope requis |
| 403 | `ecriture_exige_gestionnaire` | écriture avec une clé cabinet |
| 403 | `hors_perimetre` | écriture sur une copro hors du portefeuille de la clé |
| 400 | `parametres_invalides` | query/body/path refusés par zod |
| 404 | `introuvable` | ressource inconnue **ou hors périmètre** (anti-IDOR) |
| 409 | `ag_conclue` | écriture sur une supervision archivée |
| 503 | `api_non_configuree` | table `intranet_api_keys` pas encore créée |
| 500 | `erreur_interne` | le reste |

---

## Endpoints — lecture (scope `lecture`)

Chaque handler est **mince** : il appelle le service existant de l'intranet
(zéro logique métier dupliquée).

| Endpoint | Ce que c'est | Service appelé |
|---|---|---|
| `GET /api/v1/copros?etat=&agence=` | Copros du périmètre + état du cycle AG | `getCoprosPilotage` |
| `GET /api/v1/copros/{code}` | Fiche : identité, dates AG/CS, équipe, cycle (`actionDuMoment`), jalons, conformité | `getFicheCopro` |
| `GET /api/v1/echeances?copro=&enRetard=&tous=` | **Le produit phare** : jalons AG à venir / en retard | `getEcheances` |
| `GET /api/v1/ag-urgentes` | L'action du moment par copro imminente | `getAgSemaine` |
| `GET /api/v1/supervisions/{agId}` | Progression, sections, items, problèmes | `getSupervisionAg` |
| `GET /api/v1/problemes` | Items « problème », groupés par copro | `getProblemes` |
| `GET /api/v1/dossiers?copro=&type=&statut=` | Dossiers suivis (sans cible nominative) | `getDossiers` |
| `GET /api/v1/dossiers/{id}` | Détail : étapes + journal + équipe | `getDossier` |
| `GET /api/v1/compta/echanges` | Notes non résolues par copro (AG à venir) | `listerAgAPreparer` |
| `GET /api/v1/compta/{code}/{agDate}` | Flags + checklist + fil de notes | `getEtatCompta` |
| `GET /api/v1/openapi.json` | La spec OpenAPI 3.1 exacte de tout ceci | — |

### Exemples curl

```bash
API=https://<ton-deploiement>            # ex. l'URL Vercel de l'intranet
KEY=real31_...                            # clé créée dans /admin/cles-api

# Les copros en préparation d'AG
curl -s -H "Authorization: Bearer $KEY" "$API/api/v1/copros?etat=en_preparation&limit=20"

# La fiche d'une copro
curl -s -H "Authorization: Bearer $KEY" "$API/api/v1/copros/S104"

# Les jalons en retard
curl -s -H "Authorization: Bearer $KEY" "$API/api/v1/echeances?enRetard=true"

# Pagination : suivre nextCursor
curl -s -H "Authorization: Bearer $KEY" "$API/api/v1/copros?limit=50&cursor=<nextCursor>"
```

## Endpoints — écriture (scope dédié + clé liée à un gestionnaire)

C'est **tout** pour la v1. Le périmètre est re-vérifié par les services
(`exigerPerimetre`, anti-IDOR) ; l'auteur journalisé = initiales du gestionnaire
lié à la clé.

**`POST /api/v1/supervisions/{agId}/items/{itemId}`** — scope `ecriture:supervision`
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"statut":"ok","commentaire":"vérifié le 23/07"}' \
  "$API/api/v1/supervisions/S104__2026-05-28/items/log.lieu-reserve"
```
Body : `{statut: ok|probleme|non_applicable, commentaire?}`. Idempotente :
rejouer le même statut aboutit au même état final. (`non_verifie` est refusé :
revenir en arrière est un geste d'UI.)

**`POST /api/v1/compta/{code}/{agDate}/notes`** — scope `ecriture:compta`
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -H "Idempotency-Key: note-rappro-2026-07-23" \
  -d '{"texte":"Le rappro bancaire de juin est-il passé ?"}' \
  "$API/api/v1/compta/S104/2026-05-28/notes"
```
Header optionnel `Idempotency-Key` : rejouer le même POST (même clé API + même
Idempotency-Key) répond `{ok:true, rejoue:true}` sans doublon. **Limite assumée** :
mémoire de process best-effort — un redéploiement / une autre instance serverless
ne s'en souvient pas (d'où l'intérêt de garder les écritures naturellement
idempotentes-friendly).

---

## Panneau d'administration `/admin/cles-api`

Réservé **super-admin** (`SUPER_ADMINS`) — garde serveur sur la page **et** sur
chaque action ; entrée sidebar « Administration → Clés API » visible super-admin
seulement.

- **Créer** : nom, scopes (cases), gestionnaire lié optionnel, expiration
  optionnelle → le **clair est affiché une seule fois** (bouton copier).
- **Liste** : préfixe (`real31_x…`), nom, scopes, gestionnaire, expiration,
  dernier usage, usage du jour, état (Active / Expirée / Révoquée).
- **Révoquer** : en 2 temps (clic « Révoquer » puis « Confirmer ? »), effet
  immédiat, la ligne reste pour l'audit.

**Prérequis SQL** (à passer une fois, à la main, dans le SQL editor Supabase) :
`supabase/sql/intranet_api_keys.sql`. Tant que la table n'existe pas, l'API
répond `503 api_non_configuree` et le panneau l'affiche calmement.

---

## Serveur MCP « real31 »

`mcp/real31-mcp.mjs` — serveur **stdio** mince (`@modelcontextprotocol/sdk`) :
**chaque tool = un fetch de l'API v1** avec la clé. Le poste qui l'héberge ne
détient **jamais** de `service_role` ni d'accès base — seulement une clé API
révocable, aux scopes bornés.

Tools lecture : `lister_copros`, `fiche_copro`, `echeances_ag`, `ag_urgentes`,
`supervision_ag`, `problemes`, `lister_dossiers`, `echanges_compta`.
Tools écriture (si la clé a le scope) : `cocher_item_supervision`,
`poser_note_compta` — leurs descriptions annoncent qu'ils **agissent
immédiatement** et ils exigent `confirmation: true`.

### Config Claude Desktop (à coller dans `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "real31": {
      "command": "node",
      "args": ["C:\\Users\\SekouKOMA\\projects\\real31-intranet\\mcp\\real31-mcp.mjs"],
      "env": {
        "REAL31_API_URL": "https://<ton-deploiement>",
        "REAL31_API_KEY": "real31_..."
      }
    }
  }
}
```

(Sur Mac : adapter `args` au chemin du clone, ex.
`"/Users/<toi>/projects/real31-intranet/mcp/real31-mcp.mjs"`.)

Le script exige que `node_modules` du repo soit installé (`corepack pnpm install`),
puisqu'il importe le SDK MCP depuis le projet.

---

## Récap sécurité

1. **Hash only** : jamais de clé en clair stockée/loguée ; comparaison timing-safe.
2. **Cloisonnement machine** : clé gestionnaire = son portefeuille ; clé cabinet =
   lecture transverse ; **toute écriture exige un gestionnaire** + périmètre
   re-vérifié service (anti-IDOR).
3. **Auth dans les handlers**, proxy exclu (`/api/v1`), erreurs normalisées.
4. **Pas de PII copropriétaires** dans les réponses.
5. **Ligne rouge** : aucune écriture eStale / mail / suppression / conclusion / 
   injection — le GO/STOP humain reste dans l'UI.
6. MCP **sans** service_role : une clé révocable, c'est tout.
