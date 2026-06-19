<!-- Audit SaaS multi-agents (8 dimensions + verification adversariale + synthese), 2026-06-19.
     45 agents, ~1.7M tokens. Source de verite : le code (branche increment/04-referentiel). -->

# Audit SaaS - Intranet REAL31

## Synthèse exécutive

L'app a une fondation architecturale saine (hexagonale, ports/adapters, TS strict) et un produit métier pensé, mais elle est **à mi-chemin d'un vrai SaaS**. Trois familles de problèmes la séparent du niveau Linear/Stripe/1Password : (1) **sécurité du cloisonnement** - la RLS est intégralement bypassée par `service_role`, le cloisonnement repose sur des filtres applicatifs avec au moins deux trous concrets (`marquerNoteAction` IDOR, `listerAgAPreparer` sans `managerId`) ; (2) **accessibilité de base absente** - zéro `focus-visible`, contrastes sous-AA, formulaires sans labels, `window.confirm()` natif ; (3) **maturité produit/perf** - recherche globale factice, pas de toasts ni squelettes, client Supabase recréé 23x, couverture de tests quasi nulle hors `jalons-ag`. Priorités : **boucher les fuites de cloisonnement** (effort S/M, risque critique), **poser un socle a11y/DS** (focus, disabled, dialog, contrastes), **fiabiliser la couche données** (singleton client, bornes temporelles, RLS).

## Quick wins (fort impact, effort S/M)

| Titre | Dimension | Impact | Effort | Reco |
|---|---|---|---|---|
| IDOR `marquerNoteAction` sans contrôle d'appartenance | Sécurité | Critique | M | `coproAppartient` avant `marquerNote`, ou filtre `copropriete_id+managerId` dans l'UPDATE (`compta-repository.ts:81-87`, `actions.ts:37-46`) |
| `listerAgAPreparer()` lit toutes les copros sans `managerId` | Archi | Critique | S | Ajouter param `gestionnaireId` + passer `g.id` depuis `compta/page.tsx` (`get-compta.ts:23`) |
| `compta/[id]/page.tsx` : `findByCode` sans `managerId` | Archi | Critique->Majeur | S | Service dédié + passer `g.id` (`page.tsx:6,27`) |
| dev-login actif en prod si SSO oublié + cookie `gid` sans `secure` | Sécurité | Majeur | S | Guard `NODE_ENV==='production'`, `secure:true` sur `gid`, `SITE_PASSWORD` obligatoire (`auth.ts:13`, `dev-login/actions.ts:10`, `proxy.ts:13`) |
| Aucun `focus-visible` sur Button / NavItem / toggles | A11y / UI | Critique | S | Token focus global + `focus-visible:ring-2` sur Button, sidebar, toggles |
| Pas d'état `disabled` sur Button du DS | UI | Majeur | S | `disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none` + unifier 12 boutons ad hoc |
| Contrastes `ink-3`/`ink-4` sous AA | A11y | Majeur | S->M | Rehausser `ink-3`->~#6b6b70, `ink-4` réservé décoratif (`globals.css:22-23`) |
| Formulaires inline sans label programmatique | A11y | Majeur | S | `aria-label` sur dates, `htmlFor/id` sur select majorité, `sr-only` labels (`editeur-date.tsx:53`, `composer-odj.tsx:710-735`, `ligne-champ.tsx:95`) |
| Pas de live region sur feedback async | A11y | Majeur | S | `role="status"`/`aria-live` + `role="alert"` erreurs (`composer-odj.tsx:788`, `compta-panel.tsx:154`) |
| Onglets verrouillés en `<span>` inaccessibles | A11y | Majeur | S | `<button disabled aria-disabled>` + `sr-only` message (`fiche-copro-vue.tsx:35-44`) |
| Tablist sans rôles ARIA | A11y | Majeur | M | `role=tablist/tab/tabpanel` + nav clavier (`fiche-copro-vue.tsx:24-84`) |
| `window.confirm()` sur 2 actions destructives | UI / UX | Majeur | M | Composant Dialog DS (`composer-odj.tsx:192`, `conclure-bouton.tsx:23`) |
| Client Supabase recréé 23x | Perf / Archi | Majeur | S | Singleton module-level `getPublicClient()` (`public-client.ts:14`) |
| `getEtats(jalons)` sans borne temporelle | Perf | Majeur | S | `.gte("ag_date", today - PARCOURS_RETRO)` (`jalon-repository.ts:61-84`) |
| FluxActivite sans état vide | UX | Majeur | S | Branche `length===0` + message (`flux-activite.tsx:15`) |
| Secrets en clair dans `.env.local` | Sécurité | Critique | S | Migrer vers Vercel env + 1Password CLI ; **rotation** `SERVICE_ROLE_KEY` + mot de passe eStale |
| Barre de progression sans sémantique | A11y | Mineur | S | `role=progressbar` + `aria-valuenow/min/max` (`progression-globale.tsx:65`) |
| CTA "Préparer une AG" pointe vers une liste | UX | Majeur | M | Recibler vers parcours/ODJ copro (`dashboard-header.tsx:20`) |
| `browser.ts`/`server.ts` Supabase jamais importés | Code mort | - | S | Supprimer (ADR si client SSR/RLS prévu) |
| `read-after-write` systématique supervision | Archi / Perf | Majeur | M | Mutations `void` + `revalidatePath` (`supervision-ag-repository.ts:78,112,130`) |
| Helpers dates ISO dupliqués dans 7 fichiers | Archi | Mineur | S | `src/lib/domain/date-iso.ts` commun |
| `UrgenceTon`/`BadgeUrgence` dupliqués | Code mort | Mineur | S | Unifier via `domain/commun.ts` |

## Gros chantiers (fort impact, effort L)

- **Migrer les écritures hors `service_role` + RLS réelle** (`public-client.ts:14-26`). Toutes les mutations bypassent la RLS ; le cloisonnement n'a aucun filet BDD. Cible : anon key + policies basées sur le JWT gestionnaire sur les tables natives, `service_role` réservé aux jobs batch. C'est la dette de sécurité structurelle no1.
- **Gate SSO uniforme dans le proxy** (`proxy.ts:16-23`). En mode SSO, le middleware laisse tout passer ; la sécurité dépend du fait que chaque page appelle `getGestionnaireCourant()`. Configurer `auth` comme middleware avec un matcher pour un gate réellement uniforme (toute future route API/webhook sinon publique).
- **Couverture de tests** (`src/` : seuls 2 fichiers, dans `jalons-ag`). Prioriser les fonctions pures à risque : `parcours-ag.ts::construireLigne`, `odj.ts::pointsLegaux`/`ecartBudget`, puis `get-fiche-copro.ts`/`get-dashboard.ts` avec ports mockés. Pas de `vitest.config.ts` ni de gate CI aujourd'hui.
- **Recherche globale fonctionnelle** (`topbar.tsx:27-35`). Champ + Cmd+K + cloche à badge rouge = pure coquille, zéro handler. Sur 264 copros, friction majeure. Implémenter (cmdk + fuzzy sur noms de copros) ou masquer jusqu'à ce que ce soit réel - un faux Cmd+K dégrade la confiance.
- **Responsive / vue mobile** (`app-shell.tsx`, `mes-emails-vue.tsx`). Sidebar fixe 216px sans fallback, aside emails 300px hardcodé : inutilisable < 768px. À cadrer (drawer hamburger) ou assumer explicitement "desktop only".

## Détail par dimension

### Sécurité

**Critique**
- **Secrets de prod en clair dans `.env.local`** (`.env.local`). `SUPABASE_SERVICE_ROLE_KEY`, `ESTALE_PASSWORD`, `ESTALE_EMAIL` lisibles sur disque. Le fichier n'est pas tracké (gitignore `.env*` ok, aucun stash), mais un `git add --force` ou une lecture par outil suffit à les exposer - ce qui vient d'arriver pendant l'audit. -> Vercel env + 1Password CLI/direnv ; **rotation** de la `service_role` et du mot de passe eStale. Effort S.
- **`service_role` pour toutes les écritures, RLS bypassée** (`public-client.ts:14-26`). Utilisé par les 4+ repositories d'écriture (`jalon`, `supervision-ag`, `odj`, `compta`). Le cloisonnement repose 100 % sur des filtres applicatifs ; certains chemins sont gardés (`coproAppartient`, `.eq("managerId")`), mais `marquerNoteAction` prouve la fragilité. -> RLS réelle + anon key, `service_role` réservé batch. Effort L.

**Majeur**
- **IDOR `marquerNoteAction`** (`compta-repository.ts:81-87`, `compta/actions.ts:37-46`). `UPDATE ... .eq("id", noteId)` sans filtre d'appartenance ; un gestionnaire authentifié peut résoudre/rouvrir les notes d'une copro d'un collègue avec un UUID arbitraire. Seule action d'écriture sans `coproAppartient`. -> Ajouter le garde. Effort M.
- **Gate SSO non uniforme** (`proxy.ts:16-23`). `if (SSO_ACTIF) return NextResponse.next()` sans vérifier la session Auth.js. Pas de fuite aujourd'hui (toutes les pages appellent `getGestionnaireCourant()`), mais toute future route omettant ce check est publique. -> `auth` as middleware + matcher. Effort M.
- **dev-login actif en prod si SSO oublié** (`auth.ts:13-17`, `dev-login/actions.ts:10-15`, `dev-login/page.tsx`). Si les 3 vars Entra ID manquent au déploiement, fallback dev sans guard `NODE_ENV` ; cookie `gid` posé sans `secure:true` ; n'importe quel UUID = impersonation. Aggravant : Basic Auth a un défaut codé en dur `"real31"` (`proxy.ts:13`). -> Guard prod, `secure:true`, `SITE_PASSWORD` requis. Effort S.

### Architecture / Code

**Critique**
- **`listerAgAPreparer()` sans `managerId`** (`get-compta.ts:23`, `compta/page.tsx:16-18`). `getCoproRepository().list()` sans filtre -> la file `/compta` affiche les 264 copros du cabinet à chaque gestionnaire, notes confidentielles incluses. Fuite silencieuse. -> Param `gestionnaireId` + `g.id`. Effort S.

**Majeur**
- **`compta/[id]/page.tsx` : import router direct + `findByCode` sans `managerId`** (`page.tsx:6,27`). Viole la liste blanche `boundaries` (router non autorisé pour `app`) - filet ESLint d'ailleurs **silencieusement inopérant** (eslint-plugin-boundaries v6 + ancienne syntaxe de sélecteurs -> règle no-op). Et fiche copro accessible hors périmètre par URL forgée. -> Service dédié + `managerId`. Effort S.
- **Logique `COPRO_SOURCE` dispersée hors router** (`get-dashboard.ts:29`, `get-calendrier.ts:11`, `get-mes-evenements.ts:24`, + pages `calendrier/page.tsx:18`, `supervision-ag/[id]/page.tsx:29`, `copropriete/[code]/page.tsx:21`). 9 points d'exécution hors `router.ts`. Les 3 services sont bimodaux et by-passent le router pour leur branche supabase : ajouter un 3ᵉ mode = modifier ces services. -> Déplacer la composition "vraie data" dans des providers concrets, ou ADR + retirer les checks de `app/`. Effort M.
- **Client Supabase recréé 23x** (`public-client.ts:14`). Factory pure sans cache ; `getFicheCopro` instancie 4 clients/requête HTTP. -> Singleton module-level (pattern déjà présent côté eStale). Effort S.
- **Read-after-write systématique** (`supervision-ag-repository.ts:78,112,130`). 3-4 round-trips par cochage de case ; la valeur de retour `SupervisionAg` est **jetée** côté Server Action (toutes `Promise<void>` + `revalidatePath`). `getSupervision` re-read sans `managerId`. -> Mutations `void`. Effort M.
- **Couverture de tests quasi nulle** (`src/` : 2 fichiers dans `jalons-ag`). `parcours-ag.ts`, `odj.ts`, services composites, adapters : zéro test. Pas de `vitest.config.ts`, pas de gate CI. -> Tester d'abord les fonctions pures à risque. Effort L.

**Mineur**
- **`dev-login/page.tsx` : import router direct** (`page.tsx:2,35`). `getGestionnaireRepository().list()` contourne la couche service. -> Service fin `list-gestionnaires.ts`. Effort S.
- **Helpers dates ISO dupliqués** (`calculator.ts:10-28`, `get-dashboard.ts:52-56`, `get-mes-evenements.ts:35-38`, `get-odj.ts:27-32`, `parcours-ag.ts:30`, `supervision-ag-repository.ts:35-38`, `jalon-repository.ts:16-18`). Implémentations divergentes (`joursEntre` UTC vs `getTime()`) -> bug latent sur cas limites. -> `src/lib/domain/date-iso.ts`. Effort S.

### UI / Design system

**Majeur**
- **Aucun `focus-visible`** (`button.tsx`, `sidebar.tsx`, toggles). Aucun token focus dans `globals.css` ; 9 `focus:outline-none` sans ring de remplacement. -> Token global + `focus-visible:ring-2`. Effort S.
- **Pas d'état `disabled` sur Button** (`button.tsx:20-35`). 12 boutons ad hoc dans 7 fichiers réimplémentent disabled de façon incohérente (hover vert leak sur `composer-odj.tsx:749`, `compta-panel.tsx:146`). -> 3 classes dans Button + unifier. Effort S.
- **Typos brutes, zéro token typo** (`mes-emails-vue.tsx`, `composer-odj.tsx`). 11 tailles `text-[Npx]` distinctes, zéro `--text-*` dans `@theme`, zéro échelle Tailwind nommée. -> 6 tokens `--text-*` + remplacement. Effort M.
- **`window.confirm()` sur actions destructives** (`composer-odj.tsx:192`, `conclure-bouton.tsx:23`). Création AG eStale + conclusion AG irréversible via dialog natif. -> Composant Dialog DS (à créer - effort réel M, pas S). Effort M.

### UX / Produit

**Majeur**
- **Dashboard vs Mes événements concurrents** (`dashboard/page.tsx`, `mes-evenements/page.tsx`). Même contenu sémantique (urgences + AG), mêmes copros dans les mocks (S104/S088/S045), pas de différenciation de rôle ; CTA "Préparer une AG" pointe vers `/mes-evenements` (`dashboard-header.tsx:20`) au lieu du parcours. -> Trancher la séparation + recibler le CTA. Effort M.
- **FluxActivite sans état vide** (`flux-activite.tsx:15`). `activite.map` sans branche `length===0` -> bloc blanc muet pour un nouveau gestionnaire. -> Message + icône. Effort S.
- **Fiche copro surchargée** (`fiche-vue-ensemble.tsx:58-105`). 7 blocs empilés sans hiérarchie ; `BlocCs` = Card entière pour 2 champs ; `ProchainsEvenements` duplique l'onglet Événements ; `HistoriqueAg` toujours visible. -> 3 sections max, fusionner CS dans Ag, supprimer la duplication. Effort M.
- **Conclure l'AG via `window.confirm()`** (`conclure-bouton.tsx:22`). Action irréversible sans récap ni dialog stylé. -> Modal DS avec récapitulatif. Effort S->M.
- **Microcopy dev exposé sur ODJ** (`odj/[id]/page.tsx:53-58`). Texte d'implémentation dans le DOM ("les chiffres viendront depuis eStale"), accents manquants ; label "Mode CS - composer" opaque (`page.tsx:41`) ; aucun garde quand `dateAg` absente (formulaire rendu quand même). -> Relire la copie, renommer, CTA "Définir une date d'AG d'abord". Effort S.
- **Recherche globale factice** (`topbar.tsx:27-35`). Input nu, Cmd+K décoratif, cloche à badge rouge hardcodé sans handler. -> Implémenter ou masquer. Effort L.

### Accessibilité

**Critique**
- **Focus visible absent partout** (`button.tsx:22-35`, `sidebar.tsx:38-54`, `bloc-jalons.tsx:93-109`). WCAG 2.4.7 / 2.4.11 non satisfaits. -> Token global + `focus-visible`. Effort M.

**Majeur**
- **Tablist sans rôles ARIA** (`fiche-copro-vue.tsx:24-84`). `<button>` sans `role=tab`, pas de `tablist`/`tabpanel`, pas de nav clavier. WCAG 4.1.2. Effort M.
- **Onglets verrouillés en `<span>`** (`fiche-copro-vue.tsx:35-44`). Hors tab order, message `title` inaccessible, icône `Lock` sans `aria-hidden`. -> `<button disabled aria-disabled>` + `sr-only`. Effort S.
- **Contrastes `ink-3` (3.43:1) / `ink-4` (2.08:1, voire 1.88:1 sur surface-2)** (`globals.css:22-23`, `progression-globale.tsx:60-76`, `frise-etapes.tsx:35,58`). Texte informatif sous AA. WCAG 1.4.3. -> Rehausser. Effort M.
- **Formulaires sans label programmatique** (`editeur-date.tsx:53`, `composer-odj.tsx:710-735`, `ligne-champ.tsx:95-108`). Inputs date sans `aria-label`, select majorité sans `htmlFor/id`, placeholders seuls. WCAG 1.3.1. Effort S.
- **Pas de live region** (`composer-odj.tsx:788-791`, `compta-panel.tsx:154`). Feedback succès/erreur en `<p>` brut, spinner sans `aria-busy`. WCAG 4.1.3. Effort S.

**Mineur**
- **Barre de progression sans sémantique** (`progression-globale.tsx:65-68`). `<div>` sans `role=progressbar`/`aria-valuenow`. Effort S.

### Performance

**Majeur**
- **N+1 résolution d'équipe** (`copro-repository.ts:176-241`). `findByCode` : 2 SELECT copro en série (referenceCrypto puis referenceEstale) + 1 SELECT User. -> `.or('referenceCrypto.eq.CODE,referenceEstale.eq.CODE')` (déjà utilisé en `:208`) + `.maybeSingle()`, ou join `User!managerId`. Effort M.
- **Client Supabase recréé 23x** (`public-client.ts:14-26`). Cf. archi. 4 instances/requête sur `/copropriete/[code]`. -> Singleton. Effort S.
- **`getEtats(jalons)` sans borne temporelle** (`jalon-repository.ts:61-84`). Lit tout l'historique des jalons pour toutes les copros en cycle ; les AG passées sont fetchées puis ignorées (`get-dashboard.ts:83-89`). -> `.gte("ag_date", today - PARCOURS_RETRO)`. Effort S.

> Note : le constat "force-dynamic partout" est écarté - diagnostic invalidé (les pages sont dynamiques à cause de `cookies()` via `getGestionnaireCourant()`, pas de la directive ; ISR/`generateStaticParams` inapplicables sur app multi-gestionnaire authentifiée).

### Code mort

**Critique**
- **`browser.ts` / `server.ts` Supabase jamais importés** (`browser.ts:1`, `server.ts:1`). Aucun import dans tout l'arbre ; architecturalement incompatibles avec le bypass `service_role` actuel. -> Supprimer (ADR d'abord si client SSR/RLS prévu). Effort S.

**Majeur**
- **Port + mock `MesEvenementsProvider` inerte** (`mes-evenements-provider.ts`, `mock-mes-evenements-provider.ts`, `router.ts:89-91`). `getMesEvenementsProvider()` retourne toujours le mock ; la vraie logique supabase est inline dans `get-mes-evenements.ts:63-145`. Triumvirat mort en mode supabase. -> Unifier dans le service avec bloc mock inline. Effort M.

**Mineur**
- **`UrgenceTon`/`BadgeUrgence` dupliqués** (`mes-evenements.ts:8-12`, `mes-emails.ts:12-16`). Déjà couverts par `Ton` dans `domain/commun.ts`. -> Unifier. Effort S.

> Écartés (verdicts réfutés) : dépendance `graphql` (utilisée par `scripts/estale-schema-explore.mjs` + autorisée dans `eslint.config.mjs`), `getDashboardProvider()` (le service court-circuite le mock en mode supabase via `composerDepuisVraieData`).

## Idées produit (classées par valeur)

1. **Journal d'activité réel via `withAudit()`** (`audit/README.md`, `get-dashboard.ts:172-183`) - *Majeur, M*. Aujourd'hui le flux ne lit que `intranet_jalons` (statut `accompli`) ; supervision/ODJ/compta ne tracent rien. La table `activity_log` existe déjà (`database.ts:17-54`) mais rien ne l'alimente. Implémenter `withAudit()` (ADR-007) + wrapper dans les 5 Server Actions. Valeur : le chef de cabinet voit en temps réel l'activité de ses gestionnaires.
2. **Alertes proactives jalons (push)** - *M*. La sévérité `late/soon/ok` est déjà calculée (`calculator.ts:98-100`) mais ne déclenche rien. Job cron Supabase (`job_runs` existe) -> email Graph / notif in-app derrière un `NotificationProvider`.
3. **Digest hebdomadaire automatique** - *S*. `composerDepuisVraieData()` produit déjà tout le contenu ; un cron par gestionnaire envoie le récap "lundi matin" via Graph. Aucun nouveau domaine.
4. **Tableau de bord cabinet (direction)** - *M*. KPIs actuels tous filtrés `managerId` ; route `/cabinet` sans filtre (rôle directeur déjà mentionné ADR-009) : % copros avec AG planifiée, retards par gestionnaire, taux de convocations dans les délais. Données déjà en base.
5. **Analyse IA des emails** - *L*. Domaine `mes-emails.ts` propre (port `AnalyseMailProvider`) mais 100 % mock. Brancher Graph (lecture vraies boîtes) puis Claude (Haiku, prompts cachés) pour tri/priorité/brouillon contextualisé par `ContexteCopro`. Différenciateur fort vs CRM générique.
6. **Vue mobile-first** - *M*. Shell fixe 1100px inutilisable en mobilité ; la supervision (cocher la checklist pendant l'AG) est le cas d'usage mobile le plus utile. Layout dédié, domaine et Server Actions inchangés.
7. **Mode multi-agence** - *L*. `agenceId` existe dans `copropriete.ts:102` mais orphelin ; cloisonnement uniquement par `managerId`. Filtre agence + table `intranet_agences` (délais cabinet surchargeables) -> produit vendable à d'autres cabinets.
8. **Intégration Pennylane (circuit factures)** - *L*. Compta en read-only depuis eStale ; aucun circuit de validation. Port `FactureProvider` + webhook -> `ItemAttention` -> validation depuis l'intranet. Ferme la boucle prep AG ↔ compta réelle.
