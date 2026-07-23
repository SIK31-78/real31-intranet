# Prompt — Test E2E exhaustif de l'intranet REAL31 (navigateur)

> **Comment le lancer** : à coller dans une **NOUVELLE session Claude Code** (Fable ou Opus)
> sur ce dépôt, avec **Chrome + l'addon Claude-in-Chrome connecté**. ⚠️ Doit être exécuté par
> l'**agent principal de la session** (qui seul tient les outils navigateur) — un sous-agent
> `Agent()` n'hérite PAS du Chrome MCP (constaté 2026-07-23 : le sous-agent QA n'a reçu que
> Read/Write/Bash…, aucun outil navigateur). Serveur dev déjà lancé par Sekou sur `:3000`.

---

## Le prompt

Tu es le QA en chef d'un test E2E EXHAUSTIF de l'intranet REAL31, la veille de sa mise à
disposition à 40 collaborateurs. Détecte TOUT défaut, même infime : erreur/warning console,
lien mort, libellé faux, focus qui saute, état vide moche, latence > 3 s, faille de garde de
rôle, 404 sale, régression visuelle, débordement, incohérence de parcours. Tu testes en
CLIQUANT dans le navigateur (Chrome), pas en lisant le code. Tu ne corriges RIEN : tu
constates, tu documentes, Sekou priorise.

### Démarrage — vérifier l'accès navigateur
Charge les outils Chrome (`ToolSearch` sur `mcp__claude-in-chrome__*` si déférés), appelle
`tabs_context_mcp`, crée un onglet, navigue vers http://localhost:3000/ . Si tu ne peux PAS
piloter Chrome, arrête-toi et dis-le (ne simule rien). Ne touche jamais à `.next` (casse le
serveur dev de Sekou).

### Contexte (lis en diagonale pour t'orienter)
`docs/e2e-rapport-2026-07-23.md` (première passe partielle — va bien plus loin), `ROADMAP.md`
(carte des routes, section « État actuel »), `CLAUDE.md`, `DECISIONS.md`. Next.js 16, archi
hexagonale, surcouche syndic sur eStale. 1092 tests unitaires verts → toi tu couvres le reste
(parcours, rendu, rôles, erreurs écran).

### ⚠️ LIGNES ROUGES — écriture réelle, pas de staging
Config dev : `ESTALE_ECRITURE=reel`, `MAIL_SOURCE=graph`, `COPRO_SOURCE=supabase`. Donc :
1. **Écritures UNIQUEMENT sur `SE999`** (copro eStale = environnement de test de A à Z, assumé
   par Sekou : dates AG/CS, ODJ, conclure, supervision, dossiers → OK). URL :
   http://localhost:3000/copropriete/SE999
2. **Toute autre copro = LECTURE SEULE stricte** (elles sont réelles, source « Crypto »). Les
   voir en liste / tester le cloisonnement : OK. Cliquer un bouton qui écrit dessus : NON.
3. **MAIL — ne clique JAMAIS l'envoi final** (convocation, « mail au CS », notifications) :
   `MAIL_SOURCE=graph` enverrait un vrai mail depuis real31.fr. Va jusqu'à l'écran de
   composition/aperçu, décris-le, arrête-toi (« atteint, non envoyé — GO humain requis »).
   *(Si Sekou a mis `MAIL_PILOTES=sekou` + redémarré, alors les envois atterrissent chez lui
   seul → il peut t'autoriser à cliquer envoyer sur SE999. À confirmer dans le prompt.)*
4. **FACTURATION / Pennylane / gestion courante / récap AG = HORS PÉRIMÈTRE** : SE999 n'a pas
   les données de base pour facturer. Ouvre les écrans pour vérifier qu'ils ne crashent pas
   (état vide / refus propre attendu), mais **ne crée AUCUN brouillon Pennylane**.
5. **Signature/OneSpan, reprise de copro (grisée), Résolutions (grisée)** : hors périmètre.
6. Doute sur un clic irréversible → ne clique pas, note la question.

### Rôles — bascule via http://localhost:3000/dev-login
Teste au moins : **gestionnaire** (Charlotte LECOMTE ML / Rémi BARD LGC → portefeuille
cloisonné, pas d'Administration), **comptable pur** (Elsa PEIXOTO / Isabelle ANGLADE / Romain
GOBERT → atterrit sur `/comptabilite`, sidebar épurée, clic copro → `/compta/[code__agDate]`),
**super-admin** (Sekou KOMA → tout + Administration), **directeur** (Dimitri MYAUX / Sandy
CARRIER), **assistant** (Julie BOIRON), **admin** (Emmanuel LOPES).
**TEST DE SÉCURITÉ (crucial)** : en gestionnaire ou comptable, tape en dur `/admin/feedback`
et `/admin/cles-api` → tu DOIS être refusé (garde serveur). Si ça s'ouvre = **BLOQUANT**. De
même un gestionnaire ne doit pas voir/écrire le portefeuille d'un autre.

### Parcours à couvrir (nominal + cas limite : état vide, double-clic, retour arrière, ~1024 px)
Pour CHAQUE page : `read_console_messages` (onlyErrors + pattern), note tout warning/exception,
lien mort, libellé douteux, latence.
1. **Accueil `/accueil`** (plusieurs rôles) : Bonjour X, annonces, à-prendre-en-main, bandeau
   AG (action du moment cohérente), dossiers, Points signalés, Échanges comptables, filtres.
2. **`/copropriete`** : pipeline AG, recherche, filtres source/état/exercice, bascule
   Liste/Pipeline, cloisonnement selon rôle.
3. **Fiche SE999** : onglets (Vue d'ensemble, Événements, Dossiers, Sinistres, Contrats,
   Comptabilité), stepper « Où en est cette AG » (UNE action du moment), identité/équipe
   eStale, bandeau source liste CS. Écritures OK ici : fixer/confirmer dates AG+CS, ODJ.
4. **Cycle AG sur SE999** via `/supervision-ag/[agId]` : frise, action du moment, checklist,
   items cochables, conclure. Convocation = jusqu'à l'écran d'envoi, PAS d'envoi.
5. **Espace comptable** (comptable) : `/comptabilite`, `/compta/[code__agDate]`, checklist 9
   postes, notes ; la note doit remonter côté gestionnaire (accueil + fiche).
6. **Sinistre `/sinistre`** : wizard (questions, choix assureur, plan d'action) sans envoi de
   courrier ; **Dossier** créé sur SE999 → apparition sur l'accueil.
7. **Feedback + Nouveautés** : bouton flottant → taper une PHRASE ENTIÈRE (le focus ne doit
   PAS sauter vers la croix — bug corrigé, re-vérifie), préfixe `[TEST E2E]`, envoie. Puis
   `/nouveautes` (titre + date SEULEMENT, aucun auteur/description). Puis `/admin/feedback`
   (super-admin) : triage, statuts, création d'entrée « maison », **archiver/désarchiver**
   (archivée = hors worklist ET hors `/nouveautes`), filtres Actives/Archivées/Toutes, édition
   inline (titre/description/type/priorité/note).
8. **`/admin/cles-api`** (super-admin) : créer une clé test (clair affiché une fois), la
   **révoquer à la fin**. API v1 : `curl http://localhost:3000/api/v1/copros` sans clé → 401
   propre ; avec clé (cf. `docs/api-v1.md`) → lecture OK ; **zéro PII copropriétaire** dans les
   réponses.
9. **Reste de la sidebar** : Calendrier AG/CS, Mes e-mails, Récap AG (sans facturer),
   Coffre-fort, liens « Nos applications » / « Outils externes » (ouvrent bien, sans tester les
   apps externes).
10. **Transverses** : 404 (URL bidon → « Page introuvable » FR), arrière/avant, largeur ~1024,
    cohérence visuelle (débordements, chevauchements, contrastes).

### Nettoyage — liste EXHAUSTIVE dans le rapport
Tout artefact créé doit être traçable et purgeable : entrées feedback `[TEST E2E]` (préfixe
obligatoire), dossiers/dates/ODJ/supervision sur SE999, clé API test (révoquée). Où le trouver.

### Livrable — `docs/e2e-rapport-agent-<date>.md`
- **Verdict** (prêt / prêt avec réserves / pas prêt), 3 lignes.
- **Anomalies bloquant / gênant / confort** : parcours, repro précise, attendu vs constaté,
  rôle, capture si utile. Impitoyable (un warning console compte).
- **Validé** (tableau). **À nettoyer** (exhaustif). **Non couvert / bloqué** (+ pourquoi).
Ne corrige rien. Si tu bloques 2-3 fois sur un écran, note et passe.
