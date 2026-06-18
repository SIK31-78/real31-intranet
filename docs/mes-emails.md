# Mes emails - tri IA des mails syndic (démo)

> **Statut** : démo / premier jet · branche `demo/mes-emails` · 2026-06-17
> **Nature** : module **post-MVP** (cf. vision produit, module 3 « gestion des mails »). Isolé
> sur une branche dédiée pour ne **pas** polluer le périmètre MVP strict (`increment/02-supabase`).
> Cette doc suit l'avancement de l'initiative « tri automatique des emails ».

## C'est quoi

Un onglet **« Mes emails »** dans l'intranet qui affiche la boîte mail d'un gestionnaire
**triée automatiquement** : les mails sont regroupés par affaire, classés par type et priorité,
avec une **action proposée**. But : transformer une boîte de centaines de mails en une worklist
actionnable (« voici tes 12 affaires actives, par priorité, avec quoi faire »).

## Architecture (2 repos)

Le **cerveau** et l'**UI** sont séparés :

```
assistant-ia (repo séparé)              real31-intranet (ce repo)
─────────────────────────              ─────────────────────────
Parse PST -> pré-filtre ->               onglet « Mes emails »
nettoyage -> classification ->     ───►  (affichage de la worklist triée)
regroupement en affaires ->             route /mes-emails, archi hexagonale
action proposée                        (mock pour l'instant)
   = le TRI                               = la VUE
```

- `assistant-ia` fait le travail d'analyse (POC, voir son `ROADMAP.md` + `docs/analyse-corpus-syndic.md`).
- `real31-intranet` ne fait qu'**afficher** le résultat. Il ne reclasse rien.

### Prévu pour la suite (DB locale / IA locale - discussion ~6-7 mois)

L'hexagonal absorbe ces évolutions **sans toucher l'UI ni le service** :

- **L'analyse vit derrière un port** `AnalyseMailProvider` (à créer au branchement). Aujourd'hui : mock.
  Demain : adapter **API**. Plus tard : adapter **IA locale** (gros serveurs). = swap d'adapter dans le routeur.
- **La donnée vit derrière des repositories** (déjà le cas). Supabase aujourd'hui -> **DB locale** plus tard
  = swap d'adapter. Les tables natives (`intranet_*`) accueilleront l'état des dossiers/mails.
- Donc on finalise le mockup **maintenant** sans se bloquer ; le back « en attendant » se branchera **via API**
  derrière `AnalyseMailProvider`.

## État actuel (mockup cockpit)

> **Principe (2026-06-17)** : faciliter & automatiser. **Un mail -> UNE recommandation -> UN clic.**
> Le volet droit met en avant la **recommandation de l'assistant** (action + brouillon + bouton unique
> « Valider - répondre & classer » qui combine les gestes). Le détail (historique, plan d'action,
> contexte eStale) est en **accordéons repliés**, ouverts à la demande. On ne montre pas tout d'un coup.

Écran `/mes-emails` = **cockpit 2 volets** qui matérialise le **flux par mail entrant** :

> reçois un mail -> **analyse IA** (type, ticketable) -> **rattachement** à un dossier (ou nouveau, avec
> confiance) -> **historique du dossier** (timeline) -> **réponse** + **flow d'actions** proposés ->
> **Classer & MAJ dossier**.

- Volet gauche = la **boîte** (mails entrants, filtres priorité/type/recherche).
- Volet droit = mail + **analyse**, **rattachement** (existant % / nouveau), **historique** (timeline
  par dossier), **réponse copiable**, **flow d'actions** cochables, bouton **Classer & MAJ**.
- **V1 (2026-06-17)** : **multi-copros** (boîte agrège 3 copros + filtre copro), **lu/non-lu**,
  **statut** Nouveau / Répondu / Classé (actions **Envoyer** + **Classer**), **rattachement modifiable**
  (sélecteur de dossier), **pièces jointes**.
- **Contexte eStale (2026-06-17)** : bloc « Contexte copropriété - eStale » (volet droit), alimenté par
  le **port existant `CondoEstaleProvider`** (CS, dernière AG + PV, budget/dépenses/fonds travaux/débiteurs,
  contrats, procédures). **`SE999`** = copro test -> **données réelles** si eStale configuré (`COPRO_SOURCE=supabase`
  + `ESTALE_EMAIL/PASSWORD`), sinon dégradation propre. Les copros fictives (S104/S045) montrent le mock eStale
  existant. Les **mails restent natifs** (eStale n'a pas de module mail/dossier) ; eStale n'**enrichit** que le contexte copro.
- Archi hexagonale conforme (typecheck + lint + build OK).
- **Données = mock ANONYMISÉ** (copro « Le Belvédère », noms fictifs), calqué sur le backtest réel
  Canopea. **Zéro PII dans git.** Interactions (classer, flow, copier) en **état client** (reset au reload).
- Pas encore de vraie analyse ni de mail live.

### Fichiers (pattern hexagonal)

```
src/lib/domain/mes-emails.ts                    types métier (TypeMail, AffaireTriee, MesEmails)
src/lib/ports/mes-emails-provider.ts            contrat
src/lib/adapters/mock/mock-mes-emails-provider.ts  données mock (anonymisées)
src/lib/services/mes-emails/get-mes-emails.ts   service (passe par le routeur)
src/app/mes-emails/page.tsx                      page (server component)
src/components/mes-emails/mes-emails-vue.tsx     vue
+ sidebar.tsx (nav) + router.ts (getMesEmailsProvider)
```

## Comment lancer

```powershell
cd C:\Users\SekouKOMA\Projects\real31-intranet
corepack pnpm dev        # http://localhost:3000 -> dev-login -> « Mes emails »
```

## Données : mock vs réel

- **Mock (commité)** : fictif/anonymisé, sert la démo pour quiconque clone le repo.
- **Réel (à venir, git-ignoré)** : un adapter dédié lira une **fixture** générée par `assistant-ia`
  (le tri de tes vraies archives Canopea). Permettra une démo sur **tes** affaires sans PII dans git.
  Le branchement se fera **uniquement dans `router.ts`**, sans toucher au service ni à la vue.

## Décisions

- **UI dans l'intranet, cerveau dans assistant-ia** (l'UI du produit vivra de toute façon ici, cf. doc 03 de l'étude).
- **Branche dédiée `demo/mes-emails`** : module post-MVP, ne pas mélanger au MVP strict.
- **Mock anonymisé commité, réel git-ignoré** : respecte le pattern du repo (réel = jamais commité).
- **Pas de dépendance au threading Outlook/Graph** (2026-06-17) : le `conversationId` de Graph est inégal
  (scinde/fusionne mal, et une affaire change d'objet). Le « fil » de l'UI = l'**historique du dossier**
  reconstruit par l'IA (extraction d'identifiants, cf. assistant-ia), pas le thread Outlook.
- **Dossiers (vues)** Reçus / Traités / Tous (2026-06-17) remplacent le toggle « masquer les classés » :
  valider un mail le **range dans « Traités »** (logique boîte mail).

## Backlog d'amélioration (le « comment améliorer »)

### Vue / UX (ce repo)
- [x] **Cockpit 2 volets** matérialisant le flux complet (analyse -> rattachement -> historique -> réponse/flow -> classer) - livré 2026-06-17.
- [x] Filtres (priorité/type/recherche), brouillon copiable, flow d'actions cochable, classer - livré 2026-06-17 (état client).
- [ ] **Persister** classer/flow (Server Action + table native, comme la supervision) - aujourd'hui état client (reset au reload).
- [ ] Brancher les **vraies données Canopea** (fixture git-ignorée depuis assistant-ia).
- [ ] **Changer le rattachement** réellement (sélecteur de dossier) ; **ouvrir le fil de mails** complet d'un dossier.
- [ ] Actions « pour de vrai » : envoyer la réponse, créer un ticket, lien fiche copro.
- [ ] Multi-copros (la boîte agrège plusieurs copros) - aujourd'hui une seule.

### Cerveau / tri (repo assistant-ia)
- [ ] **Passe d'éval à l'aveugle** -> accuracy défendable (avant toute confiance prod).
- [ ] Améliorer le **recall du pré-filtre** (expéditeurs internes X.500 masqués).
- [ ] Affiner le **regroupement d'affaires** (extraction d'identifiants ; sagas multi-objets).
- [ ] **Classification automatique** (aujourd'hui faite à la main par Claude Code) -> moteur scripté.
- [ ] Génération automatique de l'**action proposée**.

### Produit / infra (plus tard, Phase 1)
- [ ] **Mail live** (Microsoft Graph) - bloqué par l'App Registration DSI (4-8 sem.).
- [ ] Pipeline `assistant-ia` -> fixture/table -> intranet (flux de données automatisé).
