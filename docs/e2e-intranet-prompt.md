# Prompt — Test E2E global de l'intranet REAL31

> Prompt réutilisable : à coller tel quel dans une session Claude Code (idéalement Fable
> pour l'exploration, avec navigation navigateur). Remplacer les `[À REMPLIR]` avant de
> lancer. Écrit le 2026-07-23, à faire évoluer avec l'app.

---

## Le prompt

Tu vas tester l'intranet REAL31 de bout en bout, comme le ferait un collaborateur exigeant
la veille de la mise à disposition générale (40 personnes). Objectif : détecter ce qui
casse, ce qui trompe, ce qui frustre — PAS re-auditer le code (déjà fait). Tu testes en
CLIQUANT, pas en lisant les sources ; le code ne sert qu'à comprendre un comportement
bizarre une fois constaté.

### Contexte minimal

- App : surcouche de coordination syndic (Next.js 16 / Supabase / archi hexagonale), par-
  dessus eStale. Lis `ROADMAP.md` puis `DECISIONS.md` pour le paysage — en diagonale, tu
  n'audites pas, tu testes.
- Prod : `real31.app` (Vercel). Dev local : `pnpm dev` sur :3000 — serveur lancé par
  Sekou ; s'il ne tourne pas, DEMANDE-LUI (ne le lance pas toi-même, ne touche jamais à
  `.next` pendant qu'il tourne).
- 1092 tests unitaires verts + smokes : le socle logique est couvert. Toi tu couvres ce
  que les tests ne voient pas : les parcours réels, les enchaînements, les états vides,
  les rôles, les erreurs à l'écran.

### ⚠️ LIGNES ROUGES — données réelles

Il n'y a PAS de base de staging : dev local et prod écrivent dans la MÊME base Supabase
(264 vraies copropriétés, vrais collaborateurs). Donc :

1. **Écritures uniquement sur la copropriété de test : `[À REMPLIR — code copro test]`.**
   Jamais de saisie/modif/coche sur une autre copro, même « pour voir ». Si un parcours ne
   peut pas se tester sans écrire ailleurs, note-le et passe.
2. **Interdits absolus** : émission de facture Pennylane (la création de BROUILLON sur la
   copro test est OK, `draft:true` — le signaler dans le rapport pour suppression) ;
   envoi de mail réel ; écriture eStale (`ESTALE_ECRITURE` doit être `dry` — vérifie et
   STOPPE si ce n'est pas le cas) ; OneSpan (tenant = prod) ; suppression de données ;
   scripts de seed ; toute écriture directe en base (SQL) — tu passes par l'UI, point.
3. Le feedback (bouton « un bug / une idée ? ») écrit en vraie table : fais UN test de
   signalement, préfixe le texte par `[TEST E2E]`, et note-le pour archivage.
4. En cas de doute sur la portée d'un clic (bouton irréversible, action massive) :
   ne clique pas, note la question dans le rapport.

### Environnement et rôles

- Teste en **dev local** (l'impersonation est fail-closed en prod). Au dev-login, incarne
  successivement : un **gestionnaire** (ex. Charlotte), un **comptable pur** (Elsa,
  Isabelle ou Romain — doit atterrir sur `/comptabilite` avec sidebar épurée), un
  **super-admin** (Sekou). Vérifie à chaque rôle que la sidebar ET les gardes serveur
  correspondent (un comptable qui tape l'URL `/admin/feedback` doit être refusé).
- Fais ensuite une passe COURTE sur `real31.app` en lecture seule (pages qui chargent,
  temps de réponse, 404 propres) — sans impersonation, sans écriture.

### Parcours à tester (dans cet ordre)

Pour chaque parcours : le chemin nominal, PUIS un cas limite (état vide, donnée manquante,
double-clic, retour arrière). Note le temps de chargement ressenti quand il dépasse ~3 s.

1. **Accueil `/accueil`** — Bonjour X, annonces, à-prendre-en-main, bandeau AG (actions du
   moment cohérentes avec l'état réel), dossiers en cours, Points signalés, Échanges
   comptables. Filtres Moi/Tout/type.
2. **Cycle AG complet sur la copro test** — fixer une date (crayon → `#dates-ag`), ODJ,
   supervision `/supervision-ag/[agId]` (frise, action du moment, checklist, items
   cochables), conclure l'AG. Vérifier qu'à chaque étape le stepper de la fiche pointe
   au bon endroit et qu'il n'y a qu'UNE action proposée à la fois.
3. **Fiche copro** — identité, équipe, dates, listes de diffusion CS (bandeau source
   eStale vs secours), onglets, badges de source.
4. **Toutes les copropriétés** — pipeline AG en tête, recherche, clic vers fiche ;
   vue transverse pour l'encadrement, cloisonnée pour un gestionnaire.
5. **Espace comptable** (en comptable pur) — `/comptabilite`, clic copro →
   `/compta/[code__agDate]`, checklist 9 postes, notes d'échange ; côté gestionnaire, la
   note doit remonter (accueil + fiche).
6. **Facturation gestion courante** (en comptable/super-admin) — sur la copro test
   UNIQUEMENT : parcours jusqu'à l'aperçu ; création de brouillon Pennylane permise UNE
   fois (noter l'ID pour suppression). Vérifier le refus 0 €, les montants affichés vs
   attendus, le comportement si paramètre manquant (doit échouer BRUYAMMENT, pas
   facturer un défaut).
7. **Récap AG + dépassement CS** — depuis la supervision (modales pré-scopées),
   auto-cochage des items après création.
8. **Dossiers** (sinistres/travaux/impayés) — création sur la copro test, étapes,
   apparition sur l'accueil.
9. **Sinistre `/sinistre`** — wizard : questions, choix assureur (transparence), plan
   d'action. Sans envoi de courrier.
10. **Feedback + Nouveautés** — bouton flottant (taper une phrase ENTIÈRE dans le champ :
    le focus ne doit pas sauter), `[TEST E2E]` en préfixe ; `/nouveautes` (vitrine : ni
    auteur ni description visibles) ; `/admin/feedback` en super-admin : triage, statuts,
    création d'entrée maison, archiver/désarchiver (l'entrée archivée disparaît de
    `/nouveautes`), filtres.
11. **Admin clés API + API v1** — créer une clé de test (la révoquer à la fin) ; `curl`
    sans clé = 401 propre ; avec clé = lecture OK ; vérifier qu'AUCUNE réponse API ne
    contient de PII copropriétaire (noms/emails).
12. **Transverses** — page 404 (URL bidon), navigation arrière/avant, un écran en largeur
    réduite (~1280 et ~1024), erreurs console navigateur sur chaque page visitée.

### Ce que tu ne testes PAS

Signature électronique (chantier en pause), reprise de copropriété (grisée), Mes e-mails
(pilote), écritures eStale, envoi de mails, module Résolutions (grisée).

### Livrable

Un rapport `docs/e2e-rapport-[date].md` :
- **Verdict global** en 3 lignes (prêt / prêt avec réserves / pas prêt).
- **Anomalies classées** bloquant / gênant / confort (la grille du triage feedback), avec
  pour chacune : parcours, étapes de repro, attendu vs constaté, rôle utilisé.
- **Reste à nettoyer** : la liste EXHAUSTIVE de ce que tes tests ont créé (entrées
  feedback `[TEST E2E]`, brouillon Pennylane, dossiers/dates sur la copro test, clé API)
  pour que Sekou ou une session suivante purge.
- Les questions de jugement (« ce bouton devrait-il… ») séparées des bugs.

Ne corrige RIEN toi-même : tu constates, Sekou priorise (c'est le principe du système
feedback). Si tu es bloqué plus de 2-3 essais sur un même écran, note et passe au
parcours suivant.
