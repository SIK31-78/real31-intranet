---
name: corrections
description: Triage hebdomadaire des remontees collaborateurs (bugs/idees du bouton "Un bug / une idee") puis pilotage des corrections. Utilise ce skill quand Sekou invoque /corrections, demande un point sur les feedbacks, le triage des remontees, la requalification des bugs, ou de passer des remontees en prevu/en cours/livre. Lit et ecrit intranet_feedback via scripts/feedback-triage.mjs.
---

# /corrections — triage hebdomadaire des remontees

Processus etabli avec Sekou le 2026-09-04. Cycle : `nouveau → prevu → en_cours → livre`
(ou `ecarte` avec raison). C'est SEKOU qui donne le « go » entre `prevu` et `en_cours`.

## L'outil

Toutes les lectures/ecritures passent par le script (racine du repo, service_role) :

```bash
node scripts/feedback-triage.mjs liste            # remontees actives
node scripts/feedback-triage.mjs voir <id>        # detail (description interne incluse)
node scripts/feedback-triage.mjs maj <id> statut=prevu titre="..." resume="..." severite=genant priorite=3 note="..."
```

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
5. **Statuer** : correction identifiee et jugee faisable → `statut=prevu`. Besoin d'un
   arbitrage de Sekou (choix metier, cout eleve) → laisser `nouveau` et le lister dans le
   rapport avec la question precise.

## Etape 2 — Sur le « go » de Sekou

- Passer les remontees visees en `statut=en_cours`.
- Corriger : deleguer aux agents par LOTS PAR ZONE DE CODE (jamais deux agents sur les
  memes fichiers — collisions git mesurees le 2026-09-04 ; si plusieurs lots, exiger
  `git add` par chemins explicites, jamais `-A`). Consignes agents : tronc
  `increment/02-supabase`, pas de push, machine legere (vitest cible --maxWorkers=1,
  jamais next build ni suite complete), commits atomiques francais sans marqueur IA.
- La session principale garde : la revue, `tsc --noEmit`, l'E2E navigateur (les agents
  n'ont pas le Chrome MCP), le push origin puis deploy apres verification.

## Etape 3 — Apres livraison verifiee

- `statut=livre` (le script pose `livre_at`) + s'assurer que titre et resume publics
  sont dignes de la vitrine. Ajouter en `note=` le commit qui corrige.
- Rapport final a Sekou : livre / prevu en attente de go / ecarte (avec raisons) /
  questions ouvertes. Mettre a jour ROADMAP.md + le vault si la semaine est significative.

## Garde-fous

- JAMAIS `ecarte` sans raison ; jamais supprimer une remontee.
- Ne pas exposer l'email d'un auteur (les initiales suffisent partout).
- Une remontee deja `prevu`/`en_cours` posee par Sekou a la main ne se requalifie pas
  sans lui en parler.
- Si le script echoue sur `resume_public` : le SQL
  `supabase/sql/intranet_feedback_resume_public.sql` n'est pas passe — le demander a
  Sekou, ne pas contourner.
