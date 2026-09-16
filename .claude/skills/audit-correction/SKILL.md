---
name: audit-correction
description: Audit de la codebase real31-intranet orienté CORRECTION, par lots validés par Sekou. À utiliser quand Sekou invoque /audit-correction, demande un audit (sécurité, droits, base, API/MCP, UI, tests, perf), ou veut « nettoyer » un périmètre. Sous-agents en lecture seule pour l'analyse ; l'agent principal corrige, lot par lot, après validation.
---

# /audit-correction — trouver, prouver, corriger par lots

Le but n'est pas un rapport : c'est **du code corrigé**, en petits lots que Sekou valide un par un.
Chaque constat tient en **une fiche courte** (pas de pavé). Ce qui n'est pas prouvable dans le
code n'existe pas.

## Règles absolues

1. **Phase 1 = lecture seule.** Aucun fichier modifié, aucun refactor, aucune correction avant
   que Sekou ait dit « go » sur un lot précis. Les sous-agents ne modifient JAMAIS rien.
2. **Une fiche = un problème**, format fixe (ci-dessous). Fichier + lignes obligatoires.
3. **Certain / risque / recommandation** — trois mots, jamais mélangés.
4. **Un sous-agent = un périmètre**, jamais deux agents sur la même tâche. Pas plus de 4 en
   parallèle (machine légère : ~4,6 Go de RAM libre, le serveur dev de Sekou tourne).
5. **Contraintes de la maison** : jamais `next build` ni `rm -rf .next` ; aucune nouvelle
   dépendance sans demander ; français avec accents, ESTALE en capitales ; E2E navigateur
   confinés à SE999 / T999 ; commits atomiques ; `ROADMAP.md` + vault à jour à la fin.
6. **L'agent principal consolide** : dédoublonne, tranche les contradictions, vérifie chaque
   fiche dans le code avant de la garder.

## Le périmètre (ce que les agents doivent savoir)

- **Stack** : Next.js 16 App Router, React 19, TS strict, Tailwind 4, Supabase (tables
  `intranet_*`, **RLS off**, l'app écrit via `service_role`), Vitest. Archi hexagonale :
  `domain/` pur → `ports/` → `adapters/` (supabase, estale GraphQL, pennylane, mail, sharepoint,
  mistral, signitic, mock) ← `router.ts` ← `services/` ← `app/` + `components/`. ESLint
  `boundaries` fait respecter les sens d'import. `src/proxy.ts` = middleware.
- **Vérité des données** : eStale (GraphQL) est la source primaire ; App A (`public."Copropriete"`,
  `public."User"`) est le référentiel du patron **partagé avec une autre app** — on y écrit
  (statut, dates, création de copro, équipe, rôle) et le schéma Prisma est le sien.
- **Auth / droits** : SSO Entra ID ; `lib/auth/roles.ts` = point de vérité (rôles pilotés par
  `User.role` + `intranet_habilitation`, secours par allowlists d'env ; intentions métier
  `peutFaireOffre`, `peutElire`, `peutOuvrirPerte`, `estDirection`…). Impersonation super-admin
  via cookie. Gardes attendues **dans chaque Server Action ET chaque page**.
- **Surfaces exposées** : `src/app/api/v1/*` (clés API machine, `lib/auth/cle-api`, scopes),
  serveur MCP `real31-mcp.mjs`, Server Actions (zod partout ?), webhooks éventuels.
- **Écritures externes** : Pennylane (`POST /customers`, factures brouillon/validées), App A,
  eStale (import de reprise), Graph/Outlook (agenda, mails), Signitic, OneSpan (en pause).
- **Volumes** : `intranet_registre_copros` 85 k lignes (recherche `ilike`/`imatch` sur une
  colonne texte + index gin), 1 161 propositions, 460 éditions de contrats, PostgREST plafonne
  à 1 000 lignes par réponse.
- **Docs** : `README.md`, `DECISIONS.md` (39 ADR), `ROADMAP.md`, `docs/`, `supabase/sql/*.sql`
  (passés à la main par Sekou — `EXECUTES.md` n'est pas une preuve, vérifier en base).
- **Retour utilisateur récurrent** : « c'est pas très beau » ; règle : barres de recherche
  plutôt que listes déroulantes, compteurs qui suivent les filtres, une action principale par écran.

## Le format d'une fiche

```
### [P0|P1|P2|P3] Titre court
- **Nature** : certain | risque | recommandation
- **Où** : `chemin/fichier.ts:12-40` (+ autres fichiers)
- **Preuve** : 1 à 3 lignes citées, ou la requête / le scénario qui le montre
- **Impact** : une phrase (qui est touché, à quel moment)
- **Correctif** : ce qu'on change, en une phrase ; taille S / M / L ; risque de régression
- **Dépend de** : autre fiche, SQL à passer, décision de Sekou (si applicable)
```

Priorités : **P0** sécurité / perte ou corruption de données / droits contournables ·
**P1** bug probable en usage réel, écriture externe non sûre, perf qui bloque ·
**P2** dette qui coûte à chaque évolution · **P3** confort.

## Phase 1 — cartographie (agent principal, `Explore` si besoin)

Construire une vision globale avant tout : routes `src/app/*`, actions serveur, ports et
adaptateurs, tables (`supabase/sql/`), scripts, tests (`*.test.ts`, `*.smoke.ts`, E2E),
variables d'env attendues (`grep process.env`), intégrations. Livrer **une page** : la carte +
les 5 zones à risque. Puis annoncer à Sekou quels sous-agents seront lancés et pourquoi,
**attendre son accord**.

## Phase 2 — analyses ciblées (sous-agents, lecture seule, ≤ 4 en parallèle)

Périmètres, un agent chacun ; consigne commune : « lecture seule, fiches au format ci-dessus,
rien d'autre ».

| Périmètre | Agent | Ce qu'il cherche en priorité |
|---|---|---|
| Droits & sécurité applicative | `security-auditor` | actions/pages sans garde, contournement des intentions de `roles.ts`, impersonation, cookies, validation zod manquante, données exposées dans les réponses/logs/erreurs |
| Surfaces exposées | `security-engineer` + `mcp-developer` | `/api/v1`, MCP, clés API et scopes, rate limiting, erreurs verbeuses, secrets dans le code/env/logs |
| Base & requêtes | `postgres-pro` (+ `database-optimizer` seulement si > 5 fiches) | N+1, plafond 1 000 PostgREST non paginé, index manquants sur les tables volumineuses, écritures App A sans garde-fou, absence de contrainte / unicité, RLS off et ce que ça implique |
| Next / React / TS | `nextjs-developer` + `typescript-pro` | Server/Client Components mal placés, `force-dynamic` partout, cache, `any`, types permissifs, async mal géré, erreurs avalées |
| Qualité & dette | `code-reviewer` + `refactoring-specialist` | duplication, fonctions trop longues, logique métier hors `domain/`, code mort, patterns incohérents entre modules |
| Tests | `test-automator` | scénarios critiques non testés (droits, écritures externes, calculs de facturation), tests fragiles, mocks qui masquent |
| UI / accessibilité | `accessibility-tester` + `ui-ux-tester` | états loading/error/empty, clavier, ARIA, contraste, formulaires, incohérences entre écrans — et **quoi** rend « pas beau », concrètement |
| Perf | `performance-engineer` | waterfalls de requêtes par page, composants lourds, recherches non bornées, appels externes en série |
| Intégrations Microsoft | `m365-admin` (seulement si Entra/Graph est dans le lot) | tokens, permissions Graph, gestion des refresh, erreurs |
| Docs | agent principal | écarts entre ADR/ROADMAP/README et le code réel |

Chaque agent rend **au plus 15 fiches**, les plus importantes d'abord. Pas de généralités.

## Phase 3 — consolidation (agent principal)

- Fusionner, dédoublonner, **revérifier chaque fiche dans le code** (ouvrir le fichier).
  Une fiche non vérifiée est supprimée.
- Rendre à Sekou : les **10 plus importantes** en tête, puis les fiches groupées en **lots de
  correction** cohérents (un lot = un thème, 3 à 8 fiches, une PR-taille, un commit ou deux).
  Pour chaque lot : ce qu'il corrige, ce qu'il touche, le risque, ce qui doit être passé en
  SQL ou décidé par Sekou avant.
- Les **quick wins** (S, sans risque) dans un lot à part.
- Ordre proposé : P0 → quick wins → P1 → P2. P3 listés, pas planifiés.
- **Demander explicitement** : « quel lot je démarre ? ».

## Phase 4 — correction, lot par lot (agent principal seul)

Pour chaque lot validé :
1. Annoncer le lot, rappeler les fiches.
2. Corriger **fiche par fiche** ; test unitaire ajouté ou adapté quand la fiche est un bug ;
   `tsc --noEmit`, `eslint` sur les fichiers touchés, `vitest run` ciblé, `node scripts/audit-ui.mjs`
   si de l'UI a bougé. E2E navigateur sur SE999/T999 si un écran a changé.
3. **Un commit par fiche ou par sous-thème**, message qui dit le pourquoi (pas de SHA ni de
   compteur en dur). Pas de push sans demande.
4. Si une correction demande un SQL : le fichier va dans `supabase/sql/`, le SQL est **donné
   dans la réponse** et on attend que Sekou l'ait passé (puis vérifier en base par l'API).
5. Rendre compte en 5 lignes : fait / non fait et pourquoi / ce qui reste du lot.
6. Passer au lot suivant **seulement** sur un nouveau « go ».

À la fin de la campagne : `ROADMAP.md` (section « État actuel » : ce qui a été corrigé, ce qui
reste, prochaine action), ADR si une règle a changé, note de journal dans le vault, lignes
« Nouveautés » si les collègues voient une différence.

## Ce qu'on ne fait PAS

- Refonte « parce que c'est plus propre » sans fiche qui la justifie.
- Changer le schéma d'App A (`Copropriete`, `User`, enums) : on **propose**, le patron tranche.
- Activer la RLS, changer le mode de validation Pennylane, ou toucher aux variables Vercel
  sans une fiche P0 et un accord explicite.
- Lancer les 25 agents « pour voir ».
