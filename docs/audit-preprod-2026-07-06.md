# Audit pre-prod - 2026-07-06

Audit complet multi-agents (5 dimensions : git/docs, code mort, performance, prod-readiness, APIsable/MCP) sur la branche `integration/reprise-copro`, apres le jalon "premiere injection reelle eStale complete" (S0305 Gaultier 4).

Perimetre : lecture seule, 367 fichiers TS/TSX, tsc 0, 172 tests verts (0 skip), lint 0 erreur / 3 warnings.

> Verdict global : codebase saine et bien architecturee (hexagone respecte sans exception, 4 fichiers morts sur 367, zero test rouge). MAIS la prod actuelle tourne sans les correctifs de securite de fin juin, la branche du jalon n'existe que sur un poste, et le module reprise ne peut PAS tourner sur Vercel en l'etat (murs plateforme).

---

## Statut au 2026-07-10

> Relecture de la checklist 4 jours apres l'audit (chantiers reprise-compta, dates CS/AG, mail CS, fixes Outlook). Perimetre : **tout SAUF le volet API/MCP** (section 6 + items 15-16), sorti du scope par decision Sekou 2026-07-10.
>
> **Synthese : 22 faits / 4 partiels / 8 a faire / 2 en attente d'un tiers (DSI) / section 6 hors scope.** L'essentiel des correctifs code de l'audit a ete traite dans la vague multi-agents (commits `20817c0`, `81e9090`, `473db7f`, `129d0bb`, `ee54c28`, `f91bab7`, `798b7f3`/`43b6291`). Ce qui reste avant prod est surtout **decision + plateforme + tiers**, pas du code de detail.

### Tableau de synthese

| Item | Etat | Preuve / reste-a-faire |
|---|---|---|
| **1.1** Prod sans correctifs secu | 🔄 PARTIEL | Les correctifs de fin juin SONT en prod : IDOR (`17cd7fe`,`32fe78b`,`c091f83`) + E1 profond (`e5c70c6`) sont ancetres de `deploy` (a `beb287c`). MAIS `deploy` est desormais **-21 commits** sur `origin/increment/02-supabase` = tout le chantier dates CS/AG (mail, Outlook, salles) **pas deploye**. La secu est OK ; la prod est en retard de 4 jours de feature. |
| **1.2** `integration/reprise-copro` nulle part | ✅ FAIT | `origin/integration/reprise-copro` existe, branche suivie, a jour (`3bcb107`). Jalon sauvegarde. |
| **1.3** Module reprise increprenable sur Vercel | 🔄 PARTIEL | Orientation tranchee par **ADR-030 (Sekou 2026-07-08)** : cible = injecter depuis le site, sous 4 prerequis (SSO strict, `maxDuration`/jobs, GO/STOP humain, editeur de corrections). Transitoire tenu : jamais `ESTALE_ECRITURE` sur Vercel. MAIS **aucun `maxDuration` pose nulle part** (verifie) et la refonte upload (Storage/jobs) n'est pas faite. Voir surprise n°3 (route `mapping-analyser`). |
| **1.4** Repli mock silencieux en prod | ✅ FAIT | `adapters/router.ts:63` et `:89` : `throw` si `mode==="mock" && NODE_ENV==="production"`. |
| **1.5** Route analyser anonyme sans SSO | ✅ FAIT | `auth/session.ts:92` : fallback dev-login renvoie `null` en production. |
| **1.6** PII coproprietaires dans les logs eStale | ✅ FAIT | `adapters/estale/client.ts` : `expurgerVariables()` retire les PII du log GraphQL (`473db7f`). |
| **1.7** `.gitignore` PII de `data/` | 🔄 PARTIEL | `data/**` recursif pose (`20817c0`, verifie `.gitignore:58-63`). MAIS les **fichiers metier de `docs/` toujours untracked et non ranges** (Convoc de base.pdf, ODJ 31 Foch.docx, estale-inputs-extract.txt, 450 - Couverture AG.doc...) - a ranger/ignorer avant tout push. |
| **1.8** Jamais `ESTALE_ECRITURE` sur Vercel | ✅ FAIT | Regle documentee et cadree dans ADR-030 (transitoire, geste de poste local). |
| **2.1** Retry non idempotent des mutations | ✅ FAIT | `473db7f` : mutations jamais rejouees sur 5xx (anti-doublon). |
| **2.2** Timeout 10 s sur les mutations | ✅ FAIT | `473db7f` : timeout ecritures porte a 30 s. |
| **2.3** `mapping-estale.ts` zero test | ✅ FAIT | `129d0bb` : 38 tests dedies (`services/__tests__/mapping-estale.test.ts`). |
| **2.4** `services/**` 34 fichiers 0 test (dont auth) | 🔲 A FAIRE | Toujours ~2 fichiers de test seulement sous `src/lib/services` ; `auth/session.ts` (impersonation/super-admin) non teste. Non adresse. |
| **2.5** Pas de rate limit sur la route analyse | 🔲 A FAIRE | Aucun compteur/rate-limit dans `api/reprise/`. |
| **2.6** Upload sans plafond de taille totale | ✅ FAIT | `473db7f` : plafond 40 Mo + lecture sequentielle. |
| **2.7** `jeu` jsonb = PII copro, pas de RLS | 🔲 A FAIRE | Durcissement RLS = **chantier separe jamais demarre** (recurrent depuis l'audit du 2026-06-29). Voir action prioritaire n°5. |
| **2.8** `AUTH_SECRET` presente sur Vercel ? | ✅ VERIFIE | Posee sur Vercel (ROADMAP:369, "env vars ... `AUTH_SECRET` posees") ; documentee DECISIONS.md:1184. |
| **3.1** `get-odj.ts` contourne le cache ADR-002 | ✅ FAIT | `ee54c28` ; `get-odj.ts:77` passe par `donneesCoproEstale()` (read-through). |
| **3.2** Bibliotheque resolutions + assemblee non cachees | ✅ FAIT | `ee54c28` : `React.cache` sur bibliotheque + assemblee. |
| **3.3** Waterfall comptes/debiteurs | ✅ FAIT | `ee54c28` : parallelisation. |
| **3.4** `lister()` reprise `select("*")` avec `jeu` | ✅ FAIT | `ee54c28` : liste reprise sans la colonne `jeu`. |
| **3.5** Waterfall `get-fiche-copro` x4 | ✅ FAIT | `ee54c28` : appels independants parallelises. |
| **3.6** Zero Suspense / loading.tsx | ✅ FAIT | `f91bab7` : 4 `loading.tsx` (copropriete/[code], mes-emails, odj composer, resolutions). |
| **3.7** `/resolutions` force-dynamic | ✅ FAIT | Resolu avec 3.2 (cache). |
| **4** 4 fichiers morts + `unpdf` + `graphql` | ✅ FAIT | `81e9090` : les 4 fichiers supprimes, `unpdf` et `graphql` retires de package.json (verifie). |
| **4b** eslint-boundaries `auth -> router` | 🔄 PARTIEL | Arete ajoutee + **bug documente** dans `eslint.config` (le pattern `router*.ts` sans `mode:'file'` ne matche jamais -> toute dependance vers `router.ts` passe silencieusement). Documente mais **pas corrige**. |
| **4c** eslint-plugin-boundaries API depreciee | 🔲 A FAIRE | Toujours sur l'API legacy `element-types` (verifie `eslint.config:76`). Migration non faite. |
| **5-ADR** ADR ecriture eStale + 2 candidats | ✅ FAIT | ADR-029/030/031 dans DECISIONS.md, **acceptes** (`43b6291`, Sekou 2026-07-08). |
| **5-powerapps** Suppression `docs/powerapps/` | ✅ FAIT | Absent du working tree ; portage assume vers `mythec-refactor/` + migrations facturation/recap (voir surprise n°4). |
| **5-ROADMAP** Archiver ROADMAP + liste SQL executes | 🔲 A FAIRE | Pas de `supabase/sql/EXECUTES.md` ; ROADMAP non archive par sections. Le suivi SQL reste en prose (plusieurs `SQL A LANCER` dispersés). |
| **13** Strategie de merge sinistre | 🔲 A FAIRE | `origin/increment/05-sinistres` **toujours ancetre** de `integration/reprise-copro`, module `src/app/sinistre/**` present -> merger dans `02-supabase` livrerait le sinistre jamais valide. Non tranche. |
| **DSI-1** Retrait `Application.ReadWrite.All` + `AppRoleAssignment.ReadWrite.All` | ⏸️ ATTENTE DSI | Toujours liste comme action DSI critique (ROADMAP:49). Pas fait. |
| **DSI-2** Access Policy salles / Mail.Send | ⏸️ ATTENTE DSI | Nouveau bloqueur introduit par le chantier dates (`908c86f`, Access Policy des salles) + Mail.Send (ROADMAP:338, encore 🔲). |
| **Section 6 + items 15-16** API v1 / MCP | ⛔ HORS SCOPE | Sorti du scope par decision Sekou 2026-07-10 - non evalue. |

### Les 5 actions restantes les plus importantes avant prod (ordonnees)

1. **[Sekou - decision]** Trancher la **strategie de merge sinistre** (item 13). C'est le noeud qui bloque tout : `05-sinistres` est ancetre de `integration/reprise-copro`, donc merger la reprise/les dates dans le tronc `02-supabase` livrerait aussi le module sinistre jamais valide. Sans ce choix, on ne peut pas rapprocher proprement la prod.
2. **[Sekou - GO + code]** **Rapprocher `deploy` d'`origin/increment/02-supabase`** (prod a -21 commits). Le chantier dates CS/AG (mail au CS, projection Outlook, salles) tourne en local/origin mais **n'est pas en prod**. Deploiement via le Vercel de la collegue (`git push deploy ...`), a arbitrer avec l'action 1.
3. **[code]** **Mur Vercel du module reprise** (1.3). Aucun `maxDuration` pose nulle part, et la nouvelle route `mapping-analyser` reproduit le probleme des gros bodies + longue duree. Tant que non traite : garder la reprise **local-only** (ne pas exposer `analyser`/`mapping-analyser` ni poser `ESTALE_ECRITURE` en prod). L'editeur de corrections du jeu (prerequis (d) d'ADR-030) reste le chantier produit prioritaire.
4. **[DSI]** **Retrait `Application.ReadWrite.All` + `AppRoleAssignment.ReadWrite.All`** de l'app Entra (critique, en attente depuis le 2026-06-29) + **Access Policy Exchange** (salles + boite service pour Mail.Send). Relancer la DSI.
5. **[Sekou/code]** **Durcissement RLS** (2.7 + recurrent). Tout passe en `service_role`, cloisonnement 100% en code, et la reprise ajoute du PII coproprietaires en jsonb (`reprise_dossier.jeu`). Le pont d'identite Auth.js -> JWT Supabase reste le chantier secu de fond jamais demarre.

> Notes secondaires (fil de l'eau, non bloquantes) : ranger les fichiers metier de `docs/` avant push (1.7 reste), rate limit sur la route analyse (2.5), tests de la couche `services/**` + `auth/session.ts` (2.4), migration eslint-boundaries vers `mode:'file'` (4b/4c), `EXECUTES.md` pour le suivi SQL (item 14).

---

## 1. BLOQUANTS (a traiter avant toute mise en prod)

### 1.1 La prod (real31.app) tourne SANS les correctifs de securite 🔴
Le remote `deploy` (Vercel de la collegue) est bloque au 26/06 : **32 commits de retard** sur `origin/increment/02-supabase`, dont :
- les 3 corrections de failles IDOR (`17cd7fe`, `32fe78b`, `c091f83`) - un gestionnaire connecte pouvait ecrire sur les copros des autres ;
- le cloisonnement en profondeur E1 (`e5c70c6`, garde perimetre au niveau service) ;
- la validation zod systematique des Server Actions + retrait des PII des logs.

**Fix : `git push deploy increment/02-supabase` (2 min). Independant du module reprise. LE plus urgent.**

### 1.2 `integration/reprise-copro` n'existe QUE sur ce PC
Jamais poussee (ni origin ni deploy). Tout le jalon eStale (75 commits) serait perdu sur un crash disque.
**Fix : `git push -u origin integration/reprise-copro` (backup, ne deploie rien).**

### 1.3 Le module reprise ne peut pas tourner sur Vercel en l'etat
Deux murs plateforme (limites dures, non contournables par config) :
- **Body max 4,5 Mo** sur les functions Vercel. Notre `bodySizeLimit: "30mb"` ne releve que la limite Next, pas celle de Vercel -> un RCP scanne > 4,5 Mo = `413 FUNCTION_PAYLOAD_TOO_LARGE` avant meme d'atteindre la route.
- **Duree des functions** : aucun `maxDuration` pose ; l'analyse dure 10-20 min, l'injection plusieurs minutes (493 mutations throttlees). Les functions seraient tuees en plein vol - et une injection tuee a mi-course laisse une copro a moitie creee dans eStale.

Trois options (a trancher) :
- **A. Module reprise = poste local uniquement** (griser en prod comme "Mes emails" via une variable d'env). Le plus simple, zero refonte. Coherent avec le fait que l'ecriture reelle doit rester un geste local maitrise.
- **B. Refonte upload** : client -> Supabase Storage (URL signee), la route lit depuis le Storage ; + `maxDuration` + traitement en job d'arriere-plan. Effort M/L.
- **C. Hybride** : suivi de dossier visible en prod (lecture), analyse + injection reservees au local.

### 1.4 Extraction : repli silencieux sur le MOCK en prod
Sur Vercel, `EXTRACTION_PROVIDER=claude-cli` est mort (binaire `claude` absent - repli propre, 500 lisible). MAIS si la variable est absente ET aucune cle IA posee, `modeExtraction()` retombe **silencieusement sur le mock** : de vrais PDF analyses renverraient la copro de demonstration (3 lots DUPONT) presentee comme un vrai resultat (seul garde-fou : le badge de mode).
**Fix : refuser le mode mock quand `NODE_ENV=production` (throw explicite) + poser `EXTRACTION_PROVIDER` explicite en prod (`claude` + cle API palier payant, ou `mistral`).**

### 1.5 `/api/reprise/analyser` : anonyme si le SSO n'est pas configure
La route est exclue du proxy (voulu, gros bodies). Son auth interne (`getGestionnaireCourant`) suffit UNIQUEMENT si le SSO est configure : sans les 3 vars `AUTH_MICROSOFT_*`, le fallback dev "premier gestionnaire" rend la route **totalement anonyme sur internet** (upload + extraction payante + ecriture Supabase).
**Fix : refuser le fallback dev quand `NODE_ENV=production` dans `getGestionnaireCourant` (ou garde SSO explicite dans la route).**

### 1.6 PII des coproprietaires dans les logs
`src/lib/adapters/estale/client.ts:81` : le log d'erreur GraphQL (ajoute pour le debug de l'injection) logge les `variables` completes - pour `createOwner` c'est noms + prenoms + adresses des coproprietaires -> PII dans les logs Vercel (retention tierce).
**Fix : expurger `variables` du log (garder query + errors, whitelist d'IDs au besoin).**

### 1.7 `.gitignore` : la PII de `data/` n'est pas protegee
Les regles `data/*.csv|json|txt` sont NON recursives : `data/Export crypto/listes_diffusion_20260630.csv` (PII coproprietaires) n'est PAS ignoree -> un `git add data/` la committerait. Les PDF de data/ ne sont pas couverts non plus. Fichiers metier untracked en vrac dans `docs/` (Convoc de base.pdf, ODJ 31 Foch.docx, estale-inputs-extract.txt...).
**Fix : `data/**` en ignore recursif + ranger/ignorer les fichiers metier de docs/ avant tout push.**

### 1.8 Regle d'or : ne JAMAIS poser `ESTALE_ECRITURE` sur Vercel
Le verrou actuel est juge correct (defaut dry-run, double condition, GO/STOP humain, re-resolution serveur). Mais si la variable etait posee sur Vercel, tout gestionnaire authentifie pourrait ecrire en prod eStale depuis le web. **L'injection reelle reste un geste de poste local.**

---

## 2. MAJEURS (avant d'industrialiser l'ecriture eStale)

| # | Trouvaille | Fichier | Fix |
|---|---|---|---|
| 2.1 | **Retry non idempotent** : le client eStale rejoue automatiquement la requete sur 5xx -> si le 502 survient APRES traitement, `createLot`/`createOwner` sont DUPLIQUES | `estale/client.ts:69-73` | ne rejouer que les queries, jamais les mutations |
| 2.2 | **Timeout 10 s sur les mutations** : un `createCondo` lent est avorte en pleine injection, sans compensation | `estale/client.ts:17` | timeout plus long pour les ecritures + documenter la reprise manuelle |
| 2.3 | **`mapping-estale.ts` : ZERO test** alors qu'il alimente l'ecriture reelle (troncatures, mapUsage/mapCivilite, decoupe numero de voie, construireLiensLot). Une erreur de mapping = donnees fausses ecrites chez eStale | `src/lib/reprise/services/mapping-estale.ts` | 1-2 h de tests dedies (le plus rentable du repo) |
| 2.4 | **`src/lib/services/**` : 34 fichiers, 0 test** (dont des ecritures : marquer-jalon, conclure-ag, envoyer-reponse) ; `auth/session.ts` (impersonation, super-admin) non teste | couche services historique | couvrir en priorite les ecritures + l'auth |
| 2.5 | Pas de rate limit sur la route analyse (cout IA par requete, derriere auth) | `api/reprise/analyser` | simple compteur par gestionnaire |
| 2.6 | Upload : lecture memoire de tous les PDF en parallele, sans plafond de taille totale | `route.ts:44-55` | plafond explicite + lecture sequentielle |
| 2.7 | Colonne `jeu` jsonb = PII coproprietaires en base (noms/adresses), service_role only, pas de cloisonnement gestionnaire sur la reprise (choix documente) | `reprise_dossier.jeu` | a tracer ; rend le chantier RLS plus prioritaire |
| 2.8 | `AUTH_SECRET` exigee par Auth.js v5 en prod mais jamais referencee dans le code - verifier sa presence sur Vercel | env Vercel | verifier |

---

## 3. PERFORMANCE (TOP fixes, gain/effort)

Vague 1 (React.cache session, cache token Graph, Promise.all dashboard) confirmee en place. Ce qui reste :

| # | Trouvaille | Fichier | Effort | Gain |
|---|---|---|---|---|
| 3.1 | **`get-odj.ts` CONTOURNE le cache eStale ADR-002** (appel provider direct au lieu de `donneesCoproEstale()`) -> odj / imprimer / composer = 3 sequences eStale live redondantes | `services/odj/get-odj.ts:80` | S | le fix existe deja ailleurs dans le code |
| 3.2 | **Bibliotheque de resolutions + assemblee jamais cachees** (motion bank = donnee cabinet qui change rarement, frappee live sur 2 pages ; composer = 6+ requetes eStale live par rendu) | `get-bibliotheque.ts:16`, `get-assemblee.ts:10` | S/M | reutiliser le pattern EstaleCacheStore existant |
| 3.3 | Waterfall `comptesExercice` -> `debiteursExercice` (independants) | `estale-condo-provider.ts:266-270` | S | -1 aller-retour eStale par cache-miss |
| 3.4 | `lister()` des dossiers reprise fait `select("*")` -> charge la colonne `jeu` (JSONB lourd) pour une page liste qui ne l'utilise pas | `dossier-repository-supabase.ts:90` | S | volumetrie croissante evitee |
| 3.5 | Waterfall `get-fiche-copro` (4 appels sequentiels independants) - page la plus visitee | `get-fiche-copro.ts:38-97` | M | latence directe |
| 3.6 | **Zero Suspense / loading.tsx dans toute l'app** -> ecran blanc sur les pages a chaine eStale longue | `src/app/**` | M | percu (degradation progressive) |
| 3.7 | `/resolutions` force-dynamic pour de la donnee cabinet | `resolutions/page.tsx:11` | S | se resout avec 3.2 |

Confirmes sains : client Supabase singleton, pas de N+1 sur les adapters copro/jalons, exceljs confine serveur, injection reprise sequentielle par necessite (IDs captures) et sans redondance, pas de middleware couteux.

---

## 4. CODE MORT / HYGIENE

4 fichiers morts sur 367 (preuves : zero import trouve) :

| Fichier | Note |
|---|---|
| `src/components/dashboard/parcours-ag.tsx` (137 lignes) | residu de refonte (confirme ROADMAP) |
| `src/components/dashboard/kpi-card.tsx` (49 lignes) | idem |
| `src/lib/reprise/adapters/pdf/detecter-couche-texte.ts` | seul consommateur d'`unpdf` -> retirer AUSSI `unpdf` de package.json (meme commit) |
| `src/components/fiche-copro/jalons-actions.ts` | doublon de `app/dashboard/actions.ts` (meme service) - confirmer qu'aucun branchement fiche n'est prevu avant suppression |

Autres :
- devDep `graphql` jamais importee (le client eStale fait du fetch natif) -> `pnpm remove graphql` + verif.
- Lint : import `Tantieme` inutilise (`mapping-estale.ts:12`), `_docs` (mock-extraction-provider) = les 3 warnings.
- `eslint-plugin-boundaries` en API DEPRECIEE (`element-types` legacy) : c'est la regle qui garantit l'hexagone -> migrer avant qu'une montee de version la casse silencieusement.
- 1 seul TODO reel : `domain/sinistre/data/cabinet.ts:8` (coordonnees cabinet a valider - donnees qui partent dans des courriers).
- Arete `auth -> router` absente de la allow-list boundaries alors que `session.ts` importe le routeur - a regulariser.

---

## 5. GIT / ROADMAP / ADR / DOCS

- **Branches** : `02-supabase` = a jour origin mais deploy -32 (cf. 1.1) ; `integration/reprise-copro` = 75 commits, nulle part (cf. 1.2) ; `demo/mes-emails` = 1 commit non pousse ; `05-sinistres` et `refonte/ux-parcours` propres.
- **Piege de merge** : `integration/reprise-copro` a ete creee depuis `05-sinistres` -> la merger dans `02-supabase` livrerait AUSSI le module sinistre (jamais valide visuellement). A trancher : merge en 2 temps (sinistre isolement d'abord) ou groupe assume. Conflit trivial previsible sur ROADMAP.md uniquement.
- **ADR manquants** (3 candidats "Proposed" dans `docs/reprise-copro-integration-proposition.md`, jamais formalises dans DECISIONS.md) : module natif reprise ; moteur de wizard ; **port d'ecriture eStale + injection** - ce dernier est maintenant du code qui ECRIT en prod tierce -> ADR a ecrire en priorite. + ADR candidat : extraction via CLI Claude (mode test).
- ADR 014-020 n'existent pas (saut de numerotation a clarifier). README.md date ("13 ADRs" vs 28 reels).
- ROADMAP.md : 490 lignes, coherent avec le code (verifie par sondage), mais a archiver par sections closes. Suivi des SQL lances = prose dispersee, fragile -> tenir une liste (fichier `supabase/sql/EXECUTES.md` ou tableau).
- `docs/estale-schema.json` = 13,8 Mo versionnes (a regenerer a la demande ?). `docs/estale-mutations-copro.md` = fichier vide a supprimer. `docs/powerapps/` supprime en entier (git status D) - confirmer l'intention.

---

## 6. RENDRE L'APP APISABLE / MCP (etude de conception)

### Etat des lieux : deja a ~80 % grace a l'hexagone
- Les services sont des fonctions pures de Next (`getCoproprietes(managerId?)`, `getCoprosPilotage(managerId)`, `getSupervisionAg(...)`) : le cloisonnement est un PARAMETRE explicite, pas un etat ambiant -> exactement ce qu'il faut pour une API.
- Precedent d'adapter HTTP deja en place : `api/reprise/analyser` (auth -> zod -> service -> JSON).
- Ce qui manque : une auth MACHINE (tout passe par la session SSO), et l'exclusion du proxy pour `/api/v1`.

### Voie recommandee : REST d'abord, MCP "mince" ensuite
1. **API REST `/api/v1` lecture seule + cles machine** (MVP, 1 increment, ~12 petits fichiers) :
   - Table `intranet_api_keys` (cle hashee sha256, scopes, `manager_id` nullable, expiration, revocation) - meme pattern que les autres tables natives.
   - `verifierCleApi()` + wrapper `avecCleApi(scope, handler)` dans `src/lib/auth/` ; auth DANS les handlers (pas dans le proxy Edge).
   - 3 endpoints : `GET /api/v1/copros`, `GET /api/v1/copros/{code}`, `GET /api/v1/echeances` (le produit phare : jalons AG). Champs referentiel uniquement, PAS de PII coproprietaires.
   - Cloisonnement machine : cle liee a un gestionnaire (la machine "est" ce gestionnaire) OU cle cabinet read-only (`manager_id null`) ; **toute ecriture exige un `manager_id`**.
   - Versioning par le chemin, zod colocalisee, pas de vraie infra de rate limit a cette echelle (compteur journalier).
2. **MCP "real31" par-dessus l'API** (jamais un MCP local qui embarque le service_role sur les postes) :
   - Tools : `lister_copros`, `fiche_copro`, `echeances_ag`, `supervision_ag`, `rechercher_resolution` ; plus tard `cocher_item_supervision` (cle liee gestionnaire).
   - D'abord un MCP stdio mince (~200 lignes, traduit tool -> fetch API v1 avec cle) ; puis remote (`api/mcp` via mcp-handler sur le meme Vercel).
   - **JAMAIS de tool d'injection eStale** : le GO/STOP humain est le verrou, une API le supprimerait. Si besoin un jour : l'API prepare un plan, un humain valide dans l'UI.
3. Prerequis : rien cote DSI, pas de RLS supplementaire (cloisonnement en code, coherent ADR-023). Deploiement via le Vercel de la collegue = a signaler avant push.

---

## 7. CHECKLIST ORDONNEE

**Avant tout (aujourd'hui, 10 min)**
1. [ ] `git push deploy increment/02-supabase` (rattraper les 32 commits secu de la prod) - avec GO Sekou
2. [ ] `git push -u origin integration/reprise-copro` (backup du jalon)
3. [ ] Corriger `.gitignore` (`data/**` recursif) + ranger les fichiers metier de `docs/`

**Avant d'exposer le module reprise en prod**
4. [ ] Trancher l'option 1.3 (A local-only / B refonte Storage / C hybride)
5. [ ] Refus du mock en production (1.4) + refus du fallback dev-login en production (1.5)
6. [ ] Expurger les PII du log erreur eStale (1.6)
7. [ ] Ne pas rejouer les mutations sur 5xx + timeout ecritures (2.1, 2.2)
8. [ ] Tests `mapping-estale.ts` (2.3)
9. [ ] ADR "ecriture eStale reelle" (+ les 2 autres candidats)

**Qualite / perf (fil de l'eau)**
10. [ ] Fix cache ODJ (3.1) + cache bibliotheque (3.2) + waterfalls (3.3, 3.5) + select sans `jeu` (3.4)
11. [ ] loading.tsx sur les 4 pages a chaine eStale longue (3.6)
12. [ ] Supprimer les 4 fichiers morts + `unpdf` + `graphql` ; migrer eslint-boundaries
13. [ ] Trancher la strategie de merge (sinistre d'abord ou groupe)
14. [ ] Archiver le ROADMAP par sections closes + liste des SQL executes

**Chantier suivant (quand tu veux ouvrir l'API)**
15. [ ] Increment "API v1 lecture seule + cles machine" (section 6, ~12 fichiers)
16. [ ] Puis MCP mince par-dessus
