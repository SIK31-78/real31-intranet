# CLAUDE.md - REAL31 Intranet

Instructions projet pour Claude Code.
Le global `~/.claude/CLAUDE.md` s'applique aussi (ton humain sans marqueur IA, commits atomiques, ROADMAP tenu à jour, **guider sans imposer**, validation avant push infra).

## Orientation rapide

Surcouche de coordination syndic par-dessus eStale (et Crypto/SharePoint pendant la transition). Stack : **Next.js 16 / TS strict / Tailwind 4 / Supabase / archi hexagonale (Ports & Adapters)**.
Lire dans l'ordre : `README.md` -> `DECISIONS.md` (les ADR) -> `ROADMAP.md` (avancement).

---

## Documentation : modèle hybride repo ↔ Obsidian

> Principe directeur : **le doc vit là où il est couplé.**

- **Repo = vérité opérationnelle & code-couplée.** `DECISIONS.md` (ADR complets : citent `lib/`, schémas SQL, règle ESLint `boundaries`), `ROADMAP.md` (incréments détaillés), `docs/**` (schéma eStale, Entra ID, runbooks, env). Le repo doit rester **autosuffisant** : un clone frais (autre machine, CI, build Vercel, collègue) ne doit jamais perdre la mémoire d'archi.
- **Vault Obsidian = référence produit / stratégie / "pourquoi" / porte d'entrée humaine.** C'est là que Sekou lit. Domaine `30_Intranet/` (COCKPIT + notes 01->07) + la section `30_Intranet` du `ROADMAP.md` **racine** du vault.
  - Chemin sur cette machine : `C:\Users\SekouKOMA\Projects\Cerveau REAL31`. C'est **un autre repo git**. Accès accordé via `.claude/settings.local.json` (`permissions.additionalDirectories`), **configuré par machine**.

### Au démarrage de session - lire dans l'ordre
1. `ROADMAP.md` (repo) - état opérationnel + prochaine action.
2. `DECISIONS.md` (repo) - ADR en vigueur.
3. Vault `30_Intranet/Intranet REAL31 - COCKPIT.md` - contexte stratégique, "où on en est" humain, bloqueurs.

### Quand mettre à jour quoi (déclencheurs)

| Événement | Repo (détail) | Vault Obsidian (carte) |
|---|---|---|
| **Décision structurelle / archi** | ADR **complet** dans `DECISIONS.md` | 1 ligne + lien dans `30_Intranet/03 - Decisions architecture (ADR).md` ; bump le COCKPIT si "où on en est" ou une décision clé change |
| **Fin d'incrément / session significative** | `ROADMAP.md` (état détaillé) | COCKPIT (*Où on en est* + *Décisions clés* + *Journal*) **et** la section `30_Intranet` du `ROADMAP.md` racine du vault |
| **Nouveau blocage / dépendance externe** | `ROADMAP.md` (bloqueurs) | COCKPIT - *Ce qui bloque ou attend* |
| **Apprentissage de fond réutilisable** | - | `30_Intranet/07 - Concepts appris (junior).md` |

### Règles
- **Vault = synthèse + lien**, jamais une copie du code ou de l'ADR complet -> on évite la divergence (repo = détail, vault = carte). Mettre un callout `> [!info] Source de vérité = le repo` quand c'est utile.
- **Jamais de secret / credential** dans le vault.
- Le vault est **un autre repo git** : ne le commite **pas** automatiquement. Après des MAJ vault, **le signaler à Sekou** (« notes Obsidian à committer côté vault »).
- Si le vault n'est **pas accessible** (dossier non autorisé sur cette machine) : le signaler, continuer sur le repo seul, et proposer d'ajouter le chemin dans `settings.local.json`.
- Français, ton humain. Avant un changement structurant : **proposer, ne pas foncer**.

### Cross-machine (Mac perso / PC pro)
- Ce `CLAUDE.md` + les docs repo se synchronisent **via le git du repo**.
- Le vault se synchronise **via son propre git**.
- Seul élément **par machine** : le chemin du vault dans `.claude/settings.local.json` (à ajuster sur le Mac, ex. `/Users/<toi>/.../Cerveau REAL31`).

> Détail humain de ce protocole (côté cerveau) : `30_Intranet/08 - Protocole doc Claude Code & Obsidian.md`.
