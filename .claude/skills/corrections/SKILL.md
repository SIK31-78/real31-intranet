---
name: corrections
description: Triage hebdomadaire des remontees collaborateurs (bugs/idees du bouton "Un bug / une idee") puis pilotage des corrections. Utilise ce skill quand Sekou invoque /corrections, demande un point sur les feedbacks, le triage des remontees, la requalification des bugs, ou de passer des remontees en prevu/en cours/livre. Le STATUT d'une remontee sans ticket se pose en base (scripts/feedback-triage.mjs, le cron cree le ticket une fois prevu/en_cours), celui d'une remontee avec ticket dans Linear (MCP linear).
---

# /corrections — triage hebdomadaire des remontees

Processus etabli avec Sekou le 2026-09-04. Cycle : `nouveau → prevu → en_cours → livre`
(ou `ecarte` avec raison). C'est SEKOU qui donne le « go » entre `prevu` et `en_cours`.
Sekou LIT les remontees ; c'est cet agent qui les TRAITE (confirme le 2026-10-06).

## DEUX surfaces depuis le pont Linear (ADR-043, 2026-10-06)

**Depuis le 2026-10-12, seule une remontee ACCEPTEE AU TRIAGE devient un ticket**
(plan gratuit Linear plafonne a 250 tickets). Le cron quotidien (6h) ne pousse que les
remontees `prevu` ou `en_cours` en base, sans ticket ; une remontee `nouveau` reste en
base, et une remontee ecartee au triage ne coute jamais de ticket. Le ticket naît dans
l'etat du statut : `prevu` → Todo, `en_cours` → In Progress. Donc :

| Quoi | Ou | Comment |
|---|---|---|
| **Statut**, remontee SANS ticket (`nouveau`) | **base** | le script : `maj <id> statut=prevu` (ou `ecarte raison=...`) |
| **Statut**, remontee AVEC ticket | **LINEAR** | MCP `linear` → `save_issue` avec `state=` |
| Priorite, assignation | **LINEAR** | MCP `linear` |
| **Titre** (public, vitrine) | **base** | le script ; le cron le pousse ensuite dans Linear |
| **`resume_public`** (vitrine) | **base** | le script — Linear ne sait pas faire ca |
| Severite requalifiee, note interne | **base** | le script |
| Description brute | **base** | JAMAIS modifiee (c'est la parole du collegue) |

**Ne JAMAIS poser un statut avec le script sur une remontee qui a un ticket** : le cron
de 6h relirait l'etat du ticket et ecraserait le triage pendant la nuit. Le script REFUSE d'ailleurs `statut=` dans ce cas et affiche l'identifiant du
ticket — s'il refuse, c'est que la reponse est « va dans Linear », pas « contourne ».

Correspondance etat Linear ↔ statut (elle vit dans `src/lib/domain/feedback-linear.ts`,
mappee sur le TYPE de l'etat) : Triage → `nouveau` · Backlog / Todo → `prevu` · In Progress /
In Review → `en_cours` · Done → `livre` · Canceled / Duplicate → `ecarte`.

## L'outil

Lectures et ecritures « base » passent par le script (racine du repo, service_role) :

```bash
node scripts/feedback-triage.mjs liste            # remontees actives ; <REA-xx> = ticket rattache
node scripts/feedback-triage.mjs voir <id>        # detail (description interne incluse)
node scripts/feedback-triage.mjs maj <id> titre="..." resume="..." severite=genant note="..."
node scripts/feedback-triage.mjs creer type=bug titre="..." description="..." severite=genant auteur=RB
```

`creer` sert aux remontees qui n'arrivent PAS par le bouton (un mail, un appel) : une
fois triee (`statut=prevu`), le cron la poussera dans Linear tout seul, inutile de creer
le ticket a la main.

## Etape 1 — Triage de chaque remontee `nouveau`

Pour chaque remontee, dans l'ordre :

1. **Vrai bug ou mauvais usage ?** Lire la description + la page capturee, puis VERIFIER
   dans le code (ou en reproduisant au navigateur) que le comportement decrit est bien un
   defaut — pas une fonctionnalite mal comprise. Deleguer l'investigation a un agent
   (Opus pour les cas retors, Sonnet pour les simples) quand plusieurs remontees demandent
   de creuser. Mauvais usage → `ecarte` avec une `raison=` PEDAGOGIQUE (elle explique le
   bon geste, sans jamais moquer), et le signaler a Sekou pour qu'il en parle au collegue.
   Doublon d'une remontee deja traitee → `ecarte` raison "deja couvert par ...".
2. **Requalifier la severite** si elle ne colle pas (un « bloquant » contournable devient
   `genant` ; un vrai mur devient `bloquant`). Noter le changement en `note=`.
3. **Priorite coherente** (entier, plus petit = plus haut) : bloquants d'abord, puis les
   genants qui touchent plusieurs collegues, puis le reste. Regarder les priorites deja
   posees pour rester coherent avec la file existante.
4. **Reformuler titre + resume public** (OBLIGATOIRE avant tout passage en `prevu`) :
   - `titre=` : court, clair, oriente utilisateur (« La recherche trouve les copros de
     toute l'equipe », pas « fix scope query managerId »).
   - `resume=` : 1 a 3 phrases pour la vitrine /nouveautes, lisibles par quelqu'un qui ne
     connait RIEN au code. Aucun terme technique (pas de « jalon », « RSC », « colonne »,
     « API »...), aucune occurrence d'IA ni de vocabulaire d'assistant, pas de nom de
     collegue ni de copropriete. Dire ce que la personne VOIT changer.
   - La description BRUTE du collaborateur ne se modifie jamais (c'est sa parole) et ne
     sort JAMAIS sur /nouveautes — seul `resume_public` est expose (ligne rouge du
     domaine feedback).
5. **Statuer**. Le cas courant depuis le 2026-10-12 : **pas de ticket → statuer EN BASE,
   le cron creera le ticket en Todo.**
   - **Remontee sans ticket** (pas de `<REA-xx>` dans `liste`, toutes les `nouveau`) :
     correction identifiee et jugee faisable → `maj <id> statut=prevu` (le cron de 6h
     cree le ticket en Todo ; `statut=en_cours` le ferait naitre In Progress). Mauvais
     usage ou doublon → `maj <id> statut=ecarte raison="..."` : la remontee ne part
     jamais dans Linear, aucun ticket consomme. Besoin d'un arbitrage de Sekou (choix
     metier, cout eleve) → laisser `nouveau` et lister la question precise dans le
     rapport : pas de ticket tant qu'il n'a pas tranche.
   - **Remontee deja rattachee a un ticket** (`<REA-xx>`) : statuer DANS LINEAR (MCP
     `linear`, `save_issue`) — `state="Todo"`, ou `state="Canceled"` ET la raison
     pedagogique en `note=` cote base (le cron posera `raison_ecart`, mais il n'ecrit
     qu'une trace de provenance : la raison lisible par le collegue, c'est `resume=`).
     Le script refuse `statut=` dans ce cas.
   - Titre et resume publics reformules AVANT le `statut=prevu` : le ticket nait avec
     le titre de la base.

## Etape 2 — Sur le « go » de Sekou

- Passer les tickets visees en `state="In Progress"` DANS LINEAR (pas dans le script).
- Corriger : deleguer aux agents par LOTS PAR ZONE DE CODE (jamais deux agents sur les
  memes fichiers — collisions git mesurees le 2026-09-04 ; si plusieurs lots, exiger
  `git add` par chemins explicites, jamais `-A`). Consignes agents : tronc
  `main` (le tronc), pas de push, machine legere (vitest cible --maxWorkers=1,
  jamais next build ni suite complete), commits atomiques francais sans marqueur IA.
- La session principale garde : la revue, `tsc --noEmit`, l'E2E navigateur (les agents
  n'ont pas le Chrome MCP), le push origin puis deploy apres verification.

## Etape 3 — Apres livraison verifiee

- `state="Done"` DANS LINEAR : le cron posera `livre` et `livre_at` (la date de Linear
  fait foi pour le changelog). S'assurer que titre et resume publics sont dignes de la
  vitrine AVANT, parce que c'est ce passage qui les expose. Ajouter en `note=` le commit.
- Pour que `/nouveautes` suive le jour meme sans attendre 6h, declencher le cron a la
  main : `curl "http://localhost:3000/api/cron/linear?secret=$CRON_SECRET"` (le bilan
  rendu dit ce qui a bouge).
- Rapport final a Sekou : livre / prevu en attente de go / ecarte (avec raisons) /
  questions ouvertes. Mettre a jour ROADMAP.md + le vault si la semaine est significative.

## Garde-fous

- JAMAIS `ecarte` sans raison ; jamais supprimer une remontee.
- Ne pas exposer l'email d'un auteur (les initiales suffisent partout).
- Une remontee deja `prevu`/`en_cours` posee par Sekou a la main ne se requalifie pas
  sans lui en parler.
- Si le script echoue sur `resume_public` : le SQL
  `supabase/sql/intranet_feedback_resume_public.sql` n'est pas passe — le demander a
  Sekou, ne pas contourner. Idem `intranet_feedback_linear.sql` pour les colonnes du pont.
- Le titre vit dans la BASE : le reformuler avec le script, jamais en renommant le ticket
  dans Linear (le cron repousserait l'ancien titre au passage suivant).
- Une remontee marquee `<REA-xx>` dans `liste` est deja suivie : son statut ne se touche
  que dans Linear. Une remontee sans marqueur n'a pas encore de ticket : son statut se
  pose en base, et seul `prevu` / `en_cours` la fera partir dans Linear.
