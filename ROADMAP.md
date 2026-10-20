# ROADMAP.md - REAL31 Intranet

> **Depuis le 25/09/2026, le pilotage vit dans Linear** : https://linear.app/real31
> Tickets, priorités, jalons datés, project updates hebdomadaires (pour le point avec le patron) et documents « Historique ».
> Ce fichier ne garde que ce que Linear ne sait pas : la branche Git active et le premier geste de la prochaine session.
> L'ancien ROADMAP (951 lignes, mai → septembre 2026) est archivé dans `docs/roadmap-archive-2026-09.md`.

## Où on en est

- **Prod** : `real31.app`, branche `main` (le tronc, renommé le 25/09/2026, anciennement `increment/02-supabase`), déployée via le Vercel de la collègue qui suit `main`.
- **Branche active** : `main` (le tronc). Le module « Contrats & contrôles » (REA-333, ADR-048) est **en production depuis le 20/10/2026** : il remplace l'application Suivi des Contrats Copros du patron (assurance, gaz, CTQ ascenseur et VMC). Runbook de bascule : `docs/runbook-bascule-contrats-controles.md` (étapes 1 et 2 faites : SQL passés, prestataires repris).
- **Branches en pause** :
  - `chantier/mcp-distant` : MCP distant pour Claude Team, 4 lots codés et testés (ADR-042), sauvegardée sur GitHub, mise de côté le 25/09. Tout pour reprendre est dans le ticket REA-5.
  - `chantier/mail-v12` : chantier « Mes e-mails », en pause depuis fin août, non mergée (REA-15).

## Ce qui bloque ou attend

- **MCP distant en pause** : mail DSI pas envoyé, SQL du journal pas passé (REA-5, REA-6).
- **Patron** : accord sur la validation par la comptable des factures déposées dans ESTALE (REA-11).
- **Éditeur ODJ en ligne** : arbitrage vers le 15/10, à reprendre sur de nouvelles bases — depuis REA-132 (07/10), ce qui est saisi en ligne s'exporte en Word et en PDF, donc l'argument « le Word ne reprend pas les contenus de 10 copros » est levé. Mesurer avant de décider : `node --env-file=.env.local scripts/odj-usage-editeur.mjs`.

## Prochaine action

Contrats & contrôles, étape 3 du runbook : prévenir Emmanuel et les neuf gestionnaires actifs, publier la fiche process sur l'extranet, puis figer l'ancienne appli (`LECTURE_SEULE=1` dans son `canWrite.ts`). Ensuite fusionner les 5 quasi-doublons d'entreprises, nettoyer les 44 échéances douteuses via « À compléter », et armer les rappels sujet par sujet (`CONTRATS_RAPPELS_SUJETS`).

## Où trouver quoi

| Besoin | Où |
|---|---|
| Qu'est-ce qui est en cours, prévu, bloqué | Linear, projet **Intranet REAL31** (étiquettes par chantier : Clés, MCP, AG / ODJ, Facturation, Mail, Reprise, UI, Idée, Attend externe) |
| Les reprises de copropriétés | Linear, projet **Reprises de copropriétés** (un ticket par dossier) |
| Qu'est-ce qui a été livré, quand | Linear, jalons du projet + document « Historique de l'intranet » |
| Pourquoi on a décidé ça | `DECISIONS.md` (ADR complets) |
| Comment ça marche (schéma ESTALE, Entra, runbooks, audits) | `docs/` |
| Le « pourquoi » produit, les concepts | Vault Obsidian `30_Intranet/` |
| Les remontées des collègues | Table `intranet_feedback`, triage par `/corrections` ; les retenues deviennent des tickets Linear |

## Règles de tenue

- **Fin d'incrément** : le ticket Linear passe à Done, un jalon si c'est une livraison notable, et ce fichier est mis à jour si la branche ou la prochaine action change.
- **Vendredi** : une project update par projet (Livré / En cours / Bloqué / Prochaine étape). C'est le support du point hebdo.
- **Pas de section « État actuel » empilée ici.** Le narratif va dans la project update et, si ça vaut la mémoire longue, dans le document Historique.
