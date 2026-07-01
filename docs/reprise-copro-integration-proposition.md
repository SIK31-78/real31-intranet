# Proposition - Intégration de `reprise-copro` dans l'intranet REAL31

> Statut : **PROPOSITION (non validée)**. Document de travail à discuter avec Sekou avant toute ligne de code.
> Date : 2026-07-01. Source de vérité opérationnelle = ce doc + les ADR candidats en fin.
> Méthode : 2 cartographies (reprise-copro / design system intranet) + investigation directe du schéma eStale.

---

## 0. Résumé exécutif

`reprise-copro` est un outil d'onboarding de copropriété (offre -> reprise immeuble -> intégration eStale -> mise en service). Il est **volontairement construit sur la même stack que l'intranet** (Next 16, TS strict, Tailwind 4, Supabase, hexagonal) pour être ré-intégrable. Trois axes à traiter :

1. **UI/UX** : aujourd'hui 2 pages Tailwind brut, hors design system. -> **Le rendre natif de l'intranet**, idéalement comme **module/route `/reprise-copro`** (pas un site séparé).
2. **Parcours** : le déroulé d'onboarding (17 étapes P1->CLOTURE) est une **checklist plate cochée à la main**, et **rien ne relie l'extraction au suivi**. -> **Porter le moteur de wizard du module sinistre** (arbre JSON + moteur pur + reprise brouillon).
3. **Injection eStale** : la sortie = 5 xlsx **importés à la main**. 

**La découverte qui change l'axe #3** : contrairement à ce que supposait le ROADMAP de reprise-copro ("API d'écriture eStale inexistante"), le schéma eStale expose **125 mutations**, dont exactement celles du patrimoine :
- imports en masse : `importLots`, `importOwners`, `importLinks`, `importEntries` (signature `(condoID, file: Upload!)`) - ils **avalent les xlsx déjà générés** ;
- créations granulaires : `createLot`, `createOwner`, `createDK`, `createEntry` - qui **retournent l'entité créée avec sa référence** (`Lot.reference`, `Owner.reference`, `DistributionKeys.code`).

=> **L'injection directe est faisable.** Et le point qui force aujourd'hui le workflow links en 2 phases (les codes 4-caractères attribués par eStale à l'import) **peut être résolu** par la voie granulaire (on capture les `reference` renvoyées et on construit les links en un seul flux).

**Recommandation d'ensemble** : ré-intégrer comme module natif (axe 1), porter le wizard (axe 2), et pour l'axe 3 partir sur une **injection hybride derrière le GO/STOP**, en **gardant la génération xlsx en repli**.

---

## 0bis. Décisions validées (2026-07-01)

Validées avec Sekou. Ce bloc fait foi, il prime sur les "reco" ci-dessous.

- **Portée** : **tout en local** pour l'instant (rien de committé ni poussé tant que Sekou ne le dit pas).
- **Axe 1** : **module natif** `/reprise-copro` dans l'intranet. Domaine prouvé **copié** dans l'intranet (voie B1, reprise-copro gelée). Consommer `@/components/ui/*` (pas de doublon de primitives).
- **Axe 2** : **porter le moteur de wizard** (arbre JSON + moteur pur + store reprise). Suivi = **on garde le `dossier.ts` de reprise-copro au démarrage** (voie B-β, 17 étapes P1-CLOTURE), unification sur le `Dossier` intranet **plus tard** (pas de fusion forcée maintenant).
- **Axe 3** : **le plus automatisé** = injection **bout-en-bout par API, links résolus automatiquement** (ni upload manuel, ni phase B). En interne = hybride (Option 3 : owners en granulaire pour capter les `reference` 4-car). **xlsx conservé en repli** (export de secours, déjà écrit). Toujours derrière le GO/STOP.
- **RGPD** : **hors périmètre à ce stade**. Pas de contrainte de souveraineté sur le moteur d'extraction : on garde le port `ExtractionProvider` de reprise-copro tel quel (défaut Claude). Le sujet PII pourra être rouvert plus tard.

---

## 1. État des lieux partagé

### 1.1 `reprise-copro` (ce qui est prouvé vs câblé)

**Cœur prouvé (51 tests verts, à CONSERVER tel quel)** :
- Domaine pur : `patrimoine.ts` (types + listes fermées), `regles.ts` (casse R6, codes clés), `dedup.ts` (R7, détecte/propose, ne fusionne jamais seul), `auto-checks.ts` (5 blocs de vérifs déterministes, `ok = 0 erreur`), `dossier.ts` (le modèle d'onboarding).
- Génération xlsx (`adapters/xlsx/`) : les 5 fichiers au format eStale exact + `verifierTemplatesAJour` (garde-fou anti-dérive des templates).
- Orchestrateur GO/STOP : `analyserPatrimoine` (Agent1 structure ∥ Agent2 owners -> auto-checks -> récap) ; **la production xlsx est strictement séparée** de l'analyse et **re-vérifie les auto-checks côté service** (impossible de produire avec une erreur bloquante, même via l'API).
- Port `ExtractionProvider` (abstrait l'IA) + adapters `claude/` (défaut, `inference_geo=eu`), `mistral/` (fallback souverain), `mock/`.

**Câblé mais NON validé en réel** :
- L'extraction IA : les golden `golden-s0302` (Claude + Mistral) sont **skipped** (gated sur clé API). La qualité des prompts sur de vrais documents n'a jamais été validée automatiquement.
- Supabase (migration non appliquée), routes API et UI (aucun test).
- La phase B des links (ré-import du mapping Nom->code 4-car) : le throw est testé, mais le workflow complet n'a ni UI ni test bout-en-bout.

**Ce qui manque pour un vrai produit** :
- Aucun lien extraction <-> suivi (`appliquerRecap` existe mais n'est jamais appelé depuis une route).
- Pas de page dossier détaillée ni de navigation guidée.
- UI = Tailwind utilitaire (slate/emerald), pas de design system ni branding.

**Atout d'intégration** : Supabase est **déjà** sur le même projet + même schéma `real31_intranet` que l'intranet, tables préfixées `reprise_`. La ré-intégration data est donc quasi gratuite.

### 1.2 L'intranet (ce qui est réutilisable)

- **Design system** : primitives `@/components/ui/*` (Card, Badge `ton`, Button `variant`, toast, confirm, skeleton), tokens `@theme` (`canvas/surface/ink/line`, vert marque, sémantiques `ok/warn/err/info`). Page native = server component `force-dynamic` + auth `getGestionnaireCourant()` + `AppShell active/breadcrumb` + conteneur `max-w-[1100px]`.
- **Moteur de wizard** (module sinistre) : séparation stricte **moteur pur / arbre JSON / état**. `engine/wizard.ts` (transitions immuables `answer/advance/back/revenirA`, sélecteurs dérivés, `rebuild` pour réhydrater), store `useReducer` avec **brouillon localStorage versionné + reprise + seed déterministe SSR-safe + persistance serveur en surcouche**, écran `WizardScreen` (breadcrumb de phases + Card + Précédent/Continuer + checklist tri-états non bloquante).
- **Vocabulaire "dossiers"** : agrégat `Dossier` (type/portée/statut/étapes/journal), fiche avec colonne de vie + étapes éditables + journal (timeline), liste filtrable. Server Actions au contrat `{ok, ...}` + Zod + cloisonnement `g.id` + anti-IDOR (coproCode relu serveur) + patch non destructif.
- **Pattern IA** : port `AnalyseMailProvider` + adapters `mistral/` et `mock/` + **cache versionné** (`promptVersion` -> invalidation auto), sélection par env dans `router.ts`, consommation cache-first qui ne bloque jamais sur échec API.
- **Adapter eStale** : lecture seule (ADR-002), auth **cookie de session** (`ESTALE_EMAIL`/`PASSWORD`, refresh paresseux sur 401 ; bascule clé API prévue ADR-005/022), rate limit **50 req/s**. Les écritures (ex. ODJ `createMotion`) passent déjà par ce même client authentifié.

---

## 2. Axe 1 - Alignement UI/UX + ré-intégration comme module

### État des lieux
2 pages fonctionnelles mais hors design system (page extraction upload->xlsx, page /dossiers liste+création). Aucune cohérence visuelle ni de vocabulaire avec l'intranet.

### Options

**Option A - Rester un site séparé, juste restylé.** On garde reprise-copro autonome et on remplace le Tailwind brut par le design system (copie des tokens).
- (+) Isolé, pas de risque sur l'intranet, déployable seul.
- (-) Duplication du design system (dérive garantie), double auth/nav, deux apps à maintenir, l'objectif de fusion reste théorique. Le gestionnaire jongle entre deux URLs.

**Option B - Ré-intégrer comme module natif `/reprise-copro` dans l'intranet.** (l'objectif à terme)
- (+) Un seul produit, une seule auth/nav, design system et vocabulaire partagés **par construction**, Supabase déjà mutualisé, cohérent avec l'initiative de fusion App A/App B. Le "5 gestes" pour ajouter un module est balisé (NavKey + sidebar + palette + route + layout server autour d'`AppShell`).
- (-) Il faut aligner les deux bases (versions de deps, config eslint `boundaries`), et importer le domaine prouvé de reprise-copro dans l'intranet (copie ou package partagé - à trancher).

### Recommandation
**Option B**, par étapes. C'est l'objectif déclaré, l'atout Supabase le rend peu coûteux, et le pattern d'ajout de module est déjà rôdé (sinistre). Point de vigilance relevé : **ne pas dupliquer les primitives UI** (le module sinistre a un doublon `sinistre/ui.tsx` à ne pas reproduire) - reprise-copro doit consommer `@/components/ui/*` directement.

**Sous-décision à trancher** : comment le domaine prouvé de reprise-copro (le code des 51 tests) rejoint l'intranet -
- (B1) **copier** `domain/` + `adapters/xlsx/` + `templates/` dans l'intranet (simple, mais deux copies à synchroniser tant que reprise-copro existe encore en parallèle) ;
- (B2) **package partagé** (monorepo / workspace) consommé par les deux (propre, mais met en place un monorepo - plus lourd).
Reco : **B1** au début (copie unidirectionnelle reprise-copro -> intranet, on gèle reprise-copro), B2 seulement si on garde durablement deux apps.

---

## 3. Axe 2 - Refactor du parcours guidé

### État des lieux
`dossier.ts` modélise 5 phases (`OFFRE -> PATRIMOINE -> VERIFICATION -> COMPTABILITE -> MISE_EN_SERVICE`) et 17 étapes à codes stables (P1-P5, V1-V4, C1-C6, CLOTURE), chacune `a_faire | en_cours | fait | ignore`. Mais :
- c'est une **checklist plate cochée à la main**, pas une machine à états ;
- **rien ne relie l'extraction au parcours** : `appliquerRecap` remplit compteurs/anomalies mais ne coche aucune étape (choix assumé "coché = fait ET vérifié par l'humain") ;
- OFFRE / COMPTABILITE / MISE_EN_SERVICE sont des placeholders non outillés.

### Options

**Option A - Garder la checklist plate, juste l'exposer joliment.** Une page dossier qui affiche les 17 étapes cochables, sans moteur.
- (+) Minimal.
- (-) On rate tout l'intérêt d'un parcours guidé (pas de "où j'en suis / prochaine action", pas de branches, pas de reprise). Ne répond pas à la demande.

**Option B - Porter le moteur de wizard du sinistre (arbre JSON + moteur pur + store reprise).** L'onboarding devient un arbre de nœuds `question | etape | resultat` en JSON ; on réutilise `engine/wizard.ts`, le store (brouillon localStorage versionné + reprise + seed déterministe + persistance serveur en surcouche) et `WizardScreen`.
- (+) Portage **1:1** d'un pattern déjà éprouvé, cohérent avec le sinistre. Donne "où j'en suis", reprise possible, checklist cochable par phase, branches conditionnelles (ex. sauter COMPTABILITE si pas dans le scope). Sérialisable -> reprise cross-session.
- (-) Il faut écrire l'arbre d'onboarding en JSON (travail de modélisation, mais c'est du contenu, pas du code) et **relier les transitions à l'état réel** (ex. étape P3 "produite" quand les xlsx/injection sont faits, V1 "fait" quand les auto-checks lots/clés passent).

### Recommandation
**Option B.** C'est exactement le pattern que l'intranet a déjà validé, et `dossier.ts` est le point d'ancrage prêt. Le vrai travail = (1) traduire les 17 étapes + leurs pré-requis en arbre JSON, (2) **connecter extraction/injection au parcours** (l'événement "xlsx produits" ou "import eStale OK" coche l'étape et écrit au journal).

**Sous-décision à trancher** : le modèle de suivi -
- (B-α) **unifier sur le `Dossier` de l'intranet** : une reprise génère/alimente un `Dossier` (type = `autre` ou un nouveau type `reprise`), on réutilise fiche + journal + colonne de vie de l'intranet ;
- (B-β) **garder le `dossier.ts` spécifique de reprise-copro** (17 étapes P1-CLOTURE) comme agrégat jumeau, et ne partager que l'UI.
Reco : **B-α à terme** (un seul vocabulaire dossier, cohérent avec la fusion), mais **B-β au démarrage** car les 17 étapes P1-CLOTURE sont très spécifiques à l'onboarding et déjà testées - on unifiera quand le besoin sera clair. À discuter : c'est un choix structurant.

---

## 4. Axe 3 - Injection directe vers eStale (le gros sujet)

### État des lieux (vérifié sur `docs/estale-schema.json`)
Le schéma eStale expose les mutations d'écriture du patrimoine. Deux familles :

| Famille | Mutations | Signature | Retour |
|---|---|---|---|
| **Import en masse (fichier)** | `importLots`, `importOwners`, `importLinks`, `importEntries` | `(condoID: ID!, file: Upload!)` | `Condo!` (pas les lignes créées) |
| **Création granulaire** | `createLot`, `createOwner`, `createDK`, `createEntry`, `createBuilding`, `createCondo` | `(condoID, input: ...Input!)` | l'entité créée **avec sa `reference`/`code`** |

Auth = le **client GraphQL déjà authentifié** (cookie session aujourd'hui, clé API demain). Rate limit **50 req/s**.

**Le point des codes 4-caractères** (ce qui force le workflow links en 2 phases) : eStale attribue une référence de 4 car. à chaque copropriétaire **au moment de l'import des owners**, et `links` doit référencer cette ref. Aujourd'hui : phase A = `links_DRAFT` (nom en clair), import manuel des owners, export des codes, phase B = `links` final avec les codes. **Les `create*` retournent la `reference`** -> on peut capturer les codes au fil de l'eau et éviter la phase B.

**Carte d'écriture vérifiée (2026-07-01)** - eStale utilise un pattern "objet-mutation" (`updateX(id) -> XMutation`, sur lequel on chaîne des sous-opérations). Le patrimoine complet est couvrable **par ID capturé** :

| Étape | Granulaire (retourne l'entité + son ID/`reference`) | Bulk (fichier) |
|---|---|---|
| Lots | `createLot(condoID, LotInput) -> Lot!` | `importLots(condoID, file)` |
| Clés | `createDK(condoID, DKInput) -> DistributionKeys!` (`DKInput.tantieme` = total de la clé) | - |
| Tantièmes par lot | `updateDK(dkID).upsertLot(lotID, share: Int!)` | `updateDK(dkID).importLots(file)` (le fichier tantiemes par clé) |
| Owners | `createOwner(condoID, OwnerInput, AddressInput) -> Owner!` | `importOwners(condoID, file)` |
| Links (lot<->owner) | `updateLot(lotID).upsertOwner([LotOwnerInput])` (`{ownerID, representative, division, share}`) | `importLinks(condoID, file)` |

Conséquences majeures :
- **La voie granulaire couvre TOUT par ID** (les `create*` retournent l'entité créée). On enchaîne create -> capture ID -> relie par ID. **Plus besoin des codes 4-car ni de la phase B links** : on référence par `lotID`/`ownerID` internes, pas par la ref eStale. C'est la voie "la plus automatisée".
- **Rollback FAISABLE** (correction) : pas de `delete*` top-level, MAIS chaque objet-mutation a un `.delete()` (`updateLot(id).delete()`, `updateOwner(id).delete()`, `updateDK(id).delete()`, `updateCondo(id).delete()`). En capturant les IDs créés, on peut défaire une injection partielle.
- `Upload` = scalaire présent -> l'import multipart (voie bulk) est faisable techniquement.

### Options

**Option 1 - Bulk file-import.** On garde le générateur xlsx tel quel et on POST les fichiers via `import*` (GraphQL multipart) au lieu de l'upload manuel.
- (+) Réutilise le cœur prouvé **sans le toucher**, risque minimal, effort faible. Remplace juste le geste humain d'upload.
- (-) Ne résout **pas** le problème des codes 4-car (retour `Condo`, pas les refs) -> **toujours 2 phases pour links**. Et ne couvre pas clés/tantièmes (pas d'import bulk pour eux).

**Option 2 - Granular create.** On mappe le `JeuDeDonnees` vers `createLot/createDK/createOwner/createEntry`, on capture les `reference`, on construit links en un flux.
- (+) **Résout les codes 4-car** (links en 1 phase), contrôle fin, feedback ligne par ligne (quelle ligne a échoué).
- (-) Effort élevé : N appels (rate limit 50/s -> batching/throttle), mapping input à écrire et tester, gestion **idempotence + rollback** si un import échoue en cours (une copro à moitié créée). Perd la réutilisation directe du xlsx.

**Option 3 - Hybride (recommandée).** Ordre d'import strict imposé par eStale : lots -> clés -> tantièmes -> owners -> links.
- lots : `importLots` (bulk) **ou** `createLot` ;
- clés + tantièmes : `createDK` (obligé, pas de bulk) ;
- owners : **`createOwner` granulaire** pour **capturer les `reference` 4-car** ;
- links : construits **en mémoire** à partir des refs capturées -> `importLinks` (bulk, fichier généré avec les vrais codes) **ou** create granulaire ;
- entries : hors scope MVP (comptabilité).
- (+) Résout les codes 4-car **sans** tout passer en granulaire, réutilise le xlsx là où c'est sûr (lots, links final), granulaire là où c'est nécessaire (clés, owners). 
- (-) Deux chemins à maintenir ; la complexité idempotence/rollback demeure sur la partie granulaire.

### Recommandation
**Option 3 (hybride), derrière le GO/STOP humain, avec la génération xlsx conservée en repli.** Règle métier à préserver : **récap GO/STOP avant toute injection** (comme avant toute production xlsx). L'injection API ne remplace pas le xlsx : elle s'ajoute comme mode de sortie, le xlsx reste le filet si l'API casse ou pour un import manuel de secours.

### Architecture proposée (à acter en ADR)
- **Nouveau port d'écriture** `ports/estale-ecriture-provider.ts` : `injecterPatrimoine(condoID, jeu)` orchestrant l'ordre strict + la capture des refs, renvoyant un rapport `{ créés, échecs, refs }`. **Distinct** du port de lecture (ADR-002 : l'adapter lecture reste read-only).
- **Nouvel adapter** `adapters/estale-ecriture/` : parle GraphQL via le client authentifié existant, confine les mutations. Sélection par env (comme le read : réel si creds, sinon un adapter `mock`/`dry-run` qui simule sans écrire).
- **Idempotence** : marquer chaque dossier avec l'état d'injection (quelles entités déjà créées + leurs IDs eStale), pour reprendre sans doublonner ; en cas d'échec en cours, deux filets désormais **confirmés possibles** : rollback best-effort (`.delete()` via les objets-mutation sur les IDs capturés) ou reprise idempotente (ne recréer que le manquant). Reco : reprise idempotente par défaut, rollback en option explicite.
- **Ce qui reste manuel** : le paramétrage administratif de la copro dans eStale en amont (ou `createCondo` si on l'automatise), et tout ce qui n'a pas de mutation (à recenser).

### Risques
- **Idempotence / rollback** : une injection interrompue laisse une copro partielle. Mitigation : état d'injection persistant + reprise, GO/STOP, dry-run d'abord.
- **Rate limit 50 req/s** : batching/throttle sur la voie granulaire (owners d'une grosse copro).
- **Dérive du schéma eStale** : ré-introspection périodique (déjà prévue ADR-022) + un test qui vérifie que les mutations utilisées existent toujours.
- **Format `Upload` GraphQL** : confirmer le protocole multipart accepté par eStale pour `file: Upload!`.

---

## 5. ADR candidats (statut : Proposed)

À intégrer dans `DECISIONS.md` de l'intranet **après validation** :

- **ADR-XXX - `reprise-copro` devient un module natif de l'intranet.** On abandonne le site séparé au profit d'un module `/reprise-copro` (route + sidebar + AppShell), design system et Supabase partagés. Le domaine prouvé (domaine + xlsx + templates) est importé dans l'intranet (copie gelée au départ). Respecte ADR-001 (hexagonal + boundaries).
- **ADR-XXX - Le parcours d'onboarding réutilise le moteur de wizard.** Arbre JSON de nœuds `question/etape/resultat` + moteur pur + store reprise (comme sinistre). L'extraction/injection pilote les transitions et écrit au journal. Modèle de suivi = à décider (Dossier unifié vs agrégat reprise spécifique).
- **ADR-XXX - Port d'écriture eStale + stratégie d'injection hybride.** Nouveau port + adapter d'écriture, **distinct** de l'adapter lecture read-only (ADR-002). Injection hybride (bulk lots/links + granulaire clés/owners pour capturer les refs 4-car), derrière le GO/STOP, **xlsx conservé en repli**. Étend ADR-005/022 (auth). Traite idempotence + rollback + rate limit.

---

## 6. Plan d'incréments proposé (rien n'est lancé sans validation)

1. **Inc. 1 - Module natif + alignement UI.** Créer la route `/reprise-copro` (les "5 gestes"), importer le domaine prouvé + xlsx dans l'intranet, restyler les 2 écrans existants (extraction, dossiers) avec le design system. Aucun changement fonctionnel. -> Livrable visible, faible risque.
2. **Inc. 2 - Parcours guidé.** Porter le moteur de wizard, écrire l'arbre d'onboarding JSON (17 étapes), relier extraction <-> suivi (`appliquerRecap` appelé depuis une route, transitions dérivées de l'état réel), page dossier avec colonne de vie + checklist.
3. **Inc. 3 - Injection eStale (dry-run d'abord).** Port + adapter d'écriture, adapter `mock`/dry-run, puis bulk `importLots`, puis granulaire `createDK`/`createOwner` (capture refs), links en 1 flux. Toujours derrière GO/STOP, xlsx en repli. État d'injection + idempotence.
4. **Inc. 4+ (vision).** Phases COMPTABILITE (C1-C6), phase OFFRE amont, unification du modèle Dossier.

---

## 7. Décisions à trancher par Sekou (avant de coder)

1. **Où vit ce travail** : quel repo / quelle branche (l'intranet a une règle "un seul dossier + branches" ; reprise-copro est un repo séparé). Ce doc est posé dans l'intranet (`docs/`) mais pas encore committé - à toi de dire où.
2. **Axe 1** : Option B (module natif) confirmée ? Et B1 (copie du domaine) vs B2 (package partagé) ?
3. **Axe 2** : porter le wizard (Option B) ? Et modèle de suivi B-α (Dossier unifié) vs B-β (agrégat reprise spécifique) au démarrage ?
4. **Axe 3** : stratégie hybride (Option 3) confirmée ? xlsx en repli obligatoire ?
5. **IA / RGPD** : reprise-copro extrait par défaut sur **Claude EU** (`inference_geo=eu`), l'intranet (mes-emails) sur **Mistral**. On garde le port `ExtractionProvider` de reprise-copro (plus mûr) et on aligne le choix moteur/RGPD comment ? (PII copropriétaires = sujet juridique ouvert dans le ROADMAP reprise-copro).
6. **Points techniques : RESOLUS (2026-07-01, cf. carte d'écriture vérifiée en axe 3)** - tantièmes par lot = `updateDK(dkID).upsertLot(lotID, share)` ; rollback = `.delete()` via les objets-mutation (existe) ; `Upload` scalaire présent. Reste à valider en conditions réelles (un vrai `condoID` de test + creds eStale) au moment de l'Inc. 3, en dry-run d'abord.
