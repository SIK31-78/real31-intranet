# CLAUDE.md - REAL31 Intranet

Instructions projet pour Claude Code.
Le global `~/.claude/CLAUDE.md` s'applique aussi (ton humain sans marqueur IA, commits atomiques, ROADMAP tenu à jour, **guider sans imposer**, validation avant push infra).

## Orientation rapide

Surcouche de coordination syndic par-dessus eStale (et Crypto/SharePoint pendant la transition). Stack : **Next.js 16 / TS strict / Tailwind 4 / Supabase / archi hexagonale (Ports & Adapters)**.
Lire dans l'ordre : `README.md` -> `DECISIONS.md` (les ADR) -> `ROADMAP.md` (avancement).

---

## PDF scanné : OCRiser soi-même, ne jamais le demander au user

La machine dispose de **tesseract (pack `fra`) et ocrmypdf 17.10**. Dès qu'un PDF n'a
pas de couche texte (`extract_pdf.py` répond `scanned_pdf`, ou pdfplumber rend du vide) :

```bash
ocrmypdf -l fra --skip-text "<in>.pdf" "<in>-ocr.pdf"    # puis lire le -ocr.pdf
```

Poser le fichier `-ocr.pdf` **à côté de l'original**, ne jamais écraser la source.

- **Le PATH d'une session déjà ouverte peut dater d'avant l'installation.** Si
  `ocrmypdf: command not found` : recharger le PATH depuis le registre plutôt que
  conclure à une absence —
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
  (PowerShell). Binaires : `C:\Program Files\Tesseract-OCR\tesseract.exe` et
  `…\AppData\Local\Programs\Python\Python312\Scripts\ocrmypdf.exe`.
- Les avertissements `[WinError 2]` / « could not produce PDF/A » : **Ghostscript n'est pas
  absent** — il est installé en **32 bits** (`C:\Program Files (x86)\gs\gs10.07.1\bin`, dans
  le PATH Machine) et n'expose que `gswin32c`, alors qu'ocrmypdf cherche `gswin64c`. Inutile
  de le réinstaller : seuls le PDF/A et l'optimisation sautent, la couche texte est bien
  écrite. Vérifier le résultat en lisant le PDF, pas en lisant les logs.
- Un nom de fichier accentué casse un heredoc bash : écrire un `.py` sur disque et le
  lancer, plutôt que `python -c`.
- L'OCR est une **source**, pas une vérité : contrôler ses chiffres contre un total
  indépendant avant de s'en servir (règles R9/R10 du skill `estale-migration`).

---

## Documentation : modèle hybride repo ↔ Obsidian

> Principe directeur : **le doc vit là où il est couplé.** Le vault a été **refondu le 2026-08-19** (structure Journal/Décisions/Concepts/Références + `AGENTS.md`).

- **Repo = vérité opérationnelle & code-couplée.** `DECISIONS.md` (ADR complets : citent `lib/`, schémas SQL, règle ESLint `boundaries`), `ROADMAP.md` (incréments détaillés), `docs/**` (schéma eStale, Entra ID, runbooks, env). Le repo doit rester **autosuffisant** : un clone frais (autre machine, CI, build Vercel, collègue) ne doit jamais perdre la mémoire d'archi.
- **Vault Obsidian = référence produit / stratégie / "pourquoi" / porte d'entrée humaine.** C'est là que Sekou lit. Chemin : `C:\Users\SekouKOMA\Projects\Cerveau REAL31` (**un autre repo git**, accès via `.claude/settings.local.json` → `additionalDirectories`, par machine).
  - **Sa constitution = `AGENTS.md`** (racine du vault) : lue par Claude Code ET Hermès. Qui écrit quoi, les 3 principes, le frontmatter obligatoire. **La lire avant d'écrire dans le vault.**
  - Structure du domaine `30_Intranet/` :
    - `_COCKPIT Intranet.md` — porte d'entrée courte (état + carte). **PAS un journal.**
    - `Journal/` — un jalon **daté et atomique** par note (`AAAA-MM-JJ - titre.md`), + une archive dépliable. **Pas de pavé unique.**
    - `Décisions/_Décisions - carte.md` — les ADR en **carte** (1 ligne + lien repo, jamais de copie).
    - `Concepts/` — le **savoir réutilisable** (« comment ça marche » qui ne périme pas).
    - `Références/` — les notes de fond 01-07.

### Au démarrage de session - lire dans l'ordre
1. `ROADMAP.md` (repo) - état opérationnel + prochaine action.
2. `DECISIONS.md` (repo) - ADR en vigueur.
3. Vault `30_Intranet/_COCKPIT Intranet.md` - contexte stratégique, "où on en est" humain, bloqueurs.

### Quand mettre à jour quoi (déclencheurs) — **tenir le vault à jour DÈS QUE POSSIBLE**

| Événement | Repo (détail) | Vault Obsidian (carte) |
|---|---|---|
| **Décision structurelle / archi** | ADR **complet** dans `DECISIONS.md` | 1 ligne + lien dans `Décisions/_Décisions - carte.md` ; bump le COCKPIT si "où on en est" change |
| **Fin d'incrément / session significative** | `ROADMAP.md` (état détaillé) | **nouvelle note** `Journal/AAAA-MM-JJ - titre.md` (atomique) + ajout à `Journal/_Journal Intranet - index.md` + bump COCKPIT *Où on en est* |
| **Nouveau blocage / dépendance externe** | `ROADMAP.md` (bloqueurs) | COCKPIT - *Ce qui bloque* |
| **Concept / apprentissage de fond réutilisable** | - | **nouvelle note** dans `Concepts/` + lien dans `Concepts/_Concepts - index.md`. **Le faire souvent** : chaque piège eStale, règle métier, notion d'archi comprise = une note concept. C'est le capital le plus sous-alimenté du vault. |

### Règles (cf. `AGENTS.md`)
- **Vault = carte + lien**, jamais une copie du code ou de l'ADR complet. Callout `> [!info] Source de vérité = le repo` sur toute note qui résume du repo.
- **Frontmatter obligatoire** sur chaque note (`type`, `domaine`, `source_de_verite`, `maj`, `maj_par`).
- **Jamais de secret / credential** dans le vault.
- Le vault est **un autre repo git** : ne le commite **pas** automatiquement. Après MAJ vault, **signaler à Sekou** (« notes Obsidian à committer côté vault »).
- Vault **pas accessible** sur une machine → le signaler, continuer sur le repo seul, proposer d'ajouter le chemin dans `settings.local.json`.
- Français, ton humain. Avant un changement structurant : **proposer, ne pas foncer**.

### Cross-machine (Mac perso / PC pro)
- Ce `CLAUDE.md` + les docs repo se synchronisent **via le git du repo**.
- Le vault se synchronise **via son propre git**.
- Seul élément **par machine** : le chemin du vault dans `.claude/settings.local.json`.

> Constitution complète du vault : `Cerveau REAL31/AGENTS.md`.
