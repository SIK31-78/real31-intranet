# Handoff - Module "Mes emails" (cockpit de tri/gestion de boite mail)

> Doc de passage de relais pour la session Claude Code suivante. Etat au 2026-06-25.
> A lire avec `ROADMAP.md` (entree "MES EMAILS") et `DECISIONS.md` (ADR-026, ADR-027).

## 0. Ou on travaille

- **Repo / worktree** : `C:\Users\SekouKOMA\Projects\real31-increment` (worktree du repo `real31-intranet`), branche **`increment/02-supabase`**. C'est l'environnement reel du pilote (SSO Entra actif, `COPRO_SOURCE=supabase`).
- **Non merge en prod** : `real31.app` (prod) tourne sur une autre branche ; ce module n'y est pas encore deploye.
- **Repo source du pipeline** : `C:\Users\SekouKOMA\Projects\assistant-ia` (prototype batch d'ou le pipeline a ete porte ; voir `docs/architecture-cible.md`, `docs/analyse-corpus-syndic.md`).
- **Stack** : Next.js 16 (App Router), TS strict, Supabase, hexagonal (ports/adapters, ESLint boundaries), Microsoft Graph, Mistral.
- **Valider toute modif** : `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`. Commits : pas de tirets cadratins / emojis / "Co-Authored-By" (preference Sekou).

## 1. Le but (vision Sekou)

Gerer sa boite mail **depuis l'intranet** : les mails entrants sont tries par IA, lies a des **dossiers/copropriétés**, on propose une **reponse + un plan d'action**, on peut **repondre / creer des brouillons Outlook** et **classer** (ranger le mail dans le sous-dossier Outlook de la copro). Cible : maximiser l'IA en maitrisant le cout (tokens). Pilote d'abord, puis 43 gestionnaires.

## 2. Chaine bout-en-bout (ce qui tourne)

Ingestion -> cerveau -> cache triage -> cockpit -> actions, le tout derriere des ports.

1. **Ingestion** (`src/lib/ports/mail-ingestion-provider.ts`) :
   - `src/lib/adapters/mail/graph-mail-ingestion.ts` : Microsoft Graph **app-only** (client credentials, plain fetch), lit `/users/{boite}/mailFolders/inbox/messages` avec pagination, corps en texte (`Prefer: outlook.body-content-type="text"`). Remonte `internetMessageId` (immuable) + `conversationId`.
   - `src/lib/adapters/mail/sample-mail-ingestion.ts` : echantillon (teste sans Graph).
   - `src/lib/adapters/mail/graph-auth.ts` : token Graph partage + `resoudreMessageId` (retrouve l'id Graph courant par internetMessageId).
   - Bascule : `MAIL_SOURCE=graph`.
2. **Pipeline pur** (`src/lib/domain/tri-mail/`) : `prefilter.ts`, `clean.ts` (citations/normalisation), `group.ts` (regroupement en affaires), `sender.ts` (interne/externe), `raw-mail.ts` (RawMail + types).
3. **Analyse** (`src/lib/ports/analyse-mail-provider.ts`) : `classifier()` (10 types, JSON) + `genererReponseEtPlan()`. Adapter `src/lib/adapters/mistral/mistral-analyse-provider.ts` (cle `MISTRAL_API_KEY`, `MODEL_TRI`/`MODEL_PLAN`) ou mock.
4. **Memoisation P0** (`src/lib/ports/analyse-cache-store.ts`, table `intranet_mes_emails_analyse`) : un mail deja analyse (cle `internetMessageId` + `prompt_version`) n'est JAMAIS renvoye au LLM. Une re-synchro coute ~0 token.
5. **Synchro** (`src/lib/services/mes-emails/synchroniser.ts`) : ingest -> attribution copro (objet+corps) -> regroupement -> "reutilise ou analyse" -> ecrit le triage. Plafonds `MAX_INGEST=80`, `MAX_AFFAIRES=40`. `VERSION_ANALYSE` a bumper si on change les prompts.
6. **Cache du triage** (`src/lib/ports/mes-emails-triage-store.ts`, table `intranet_mes_emails_triage`) : 1 ligne/gestionnaire (mails + dossiers en jsonb). La synchro ecrit, le cockpit lit.
7. **Lecture cockpit** (`src/lib/services/mes-emails/get-mes-emails.ts`) : lit le cache triage, fusionne l'**etat** (`intranet_mes_emails_etat`), ajoute `coprosDuGestionnaire` + contextes eStale. Repli sur fichier/mock si pas encore synchronise.
8. **Cockpit** (`src/components/mes-emails/mes-emails-vue.tsx`) : liste + detail (mail, copro affichee, recommandation, brouillon editable + signature, plan d'action). Actions via `src/app/mes-emails/actions.ts`.
9. **Etat** (`src/lib/ports/mes-emails-etat-provider.ts`, table `intranet_mes_emails_etat`) : ce que le gestionnaire fait (statut, etapes cochees, lu, brouillon edite, rattachement, **copro_code/copro_nom**). ADR-026.
10. **Sortant** : `mail-outbound-provider.ts` -> `graph-mail-outbound.ts` (cree un **brouillon Outlook** via `createReply`, fil+citation conserves, PAS de signature injectee) ; bouton "Brouillon Outlook" dans le cockpit.
11. **Boite aux lettres** : `mailbox-provider.ts` -> `graph-mailbox.ts` (**classer = deplacer** le mail dans le sous-dossier copro ; enumere les sous-dossiers sous l'inbox sur 2 niveaux, matche par code/nom). "Valider" declenche le move best-effort.
12. **Signature** : `signature-provider.ts` -> `signitic/` (Signitic, `GET /signatures/{email}/html`, cle `SIGNITIC_API_KEY`) ; rendue en aperçu iframe sandboxe sous le brouillon. **On n'injecte PAS** (Signitic add-in s'en charge ; doublon a re-tester a l'envoi).

Routeur unique : `src/lib/adapters/router.ts` (tous les `getXxx()`, bascule `COPRO_SOURCE` / `MAIL_SOURCE` / presence des cles).

## 3. SQL a executer (Supabase, schema public, SQL editor)

Fichiers dans `supabase/sql/` :
- `intranet_mes_emails_triage.sql` (cache du triage)
- `intranet_mes_emails_etat.sql` (etat ; inclut deja copro_code/copro_nom dans le create)
- `intranet_mes_emails_analyse.sql` (cache d'analyse / memoisation)
- Si la table etat existait deja avant le rattachement copro : `alter table public.intranet_mes_emails_etat add column if not exists copro_code text, add column if not exists copro_nom text;`
- Dossier de classement choisi (pivot section 8, 2026-06-25) : `alter table public.intranet_mes_emails_etat add column if not exists dossier_id text, add column if not exists dossier_nom text;` (executee par Sekou)

Lecture de l'etat en `select *` -> non-cassant si une colonne manque encore.

## 4. Env (.env.local de real31-increment)

`MAIL_SOURCE=graph` (sinon adapters echantillon/no-op), `MISTRAL_API_KEY`, `SIGNITIC_API_KEY` (absente au dernier point - a ajouter), `COPRO_SOURCE=supabase`, `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optionnel : `MODEL_TRI`, `MODEL_PLAN`.

## 5. Acces Microsoft Graph (ADR-027) - DEJA ACCORDE (2026-06-24)

Modele **Application (app-only) + Application Access Policy**, pas delegue. Permissions accordees : **`Mail.Read` + `Mail.ReadWrite` + `Mail.Send`** (Application) + admin consent. Access Policy `RestrictAccess` sur un groupe de securite a extension messagerie (`REAL31-Intranet-MailRead`) contenant la/les boite(s) du pilote ; `Test-ApplicationAccessPolicy` = `Granted`. Instructions DSI completes : `docs/entra-app-registration.md` (etape 2bis).

**Passage a l'echelle (43)** : une seule policy ; ajouter une boite = `Add-DistributionGroupMember` (ou scoper la policy sur un groupe "tous gestionnaires"). Cote code, rien a changer : on lit toujours la boite du **gestionnaire connecte** (`g.email` via SSO), donc c'est multi-boites par construction.

## 6. Etat / ce qui est teste et marche

- Vraie synchro de l'inbox du pilote (Graph app-only) : OK, tri de bout en bout.
- P0 memoisation : OK (re-synchro ~0 appel LLM).
- Affichage clair de la copro du mail (liste + detail) : OK.
- Rattachement copro manuel (selecteur des copros, persiste apres ALTER) : **valide par Sekou (tient au reload, le classement suit)**.
- Classement "Valider" -> deplace dans le sous-dossier copro Outlook : OK quand le mail a une copro.
- Brouillon Outlook (`createReply`) : code livre, test Signitic doublon **pas encore fait**.

## 7. Limites connues / dette

- **Attribution copro** = match du code/nom dans objet+corps uniquement. Un mail qui ne mentionne aucune copro reste "Non rattaché".
- **Qualite des reponses jugee trop generique** (Mistral Small + prompt generique + pas d'ancrage). Voir backlog "apprentissage du ton".
- **Classer sans copro** = aujourd'hui ca ne range nulle part (move no-op) alors que le cockpit marque "Traite" -> incoherence en cours de traitement (cf. section 8).
- Les affaires/dossiers ont des IDs jetables `S1..Sn` recalcules a chaque synchro (P2 = affaires stables).
- Synchro = bouton synchrone (1-2 min pour ~40 affaires) ; pas encore de tache de fond.

## 8. Selecteur de dossiers Outlook - FAIT (2026-06-25)

> Pivot livre (decisions multi-copro et multi-boites DIFFEREES par Sekou). Backend +
> cockpit + persistance committes en local sur `increment/02-supabase` (non pousses).
> - Port `MailboxProvider` : `listerDossiers(boite)` (racine + sous-Inbox 2 niveaux,
>   dedup -> Q1 reglee en code) et `classerDansDossier(folderId)` (move par id).
> - Cockpit : selecteur "Classer dans..." (vrais dossiers), preselection du dossier
>   copro auto-detecte, "Valider" BLOQUE tant qu'aucun dossier (fini le "Traite" qui ne
>   part nulle part), classer = move + statut classe.
> - Persistance : colonnes `dossier_id`/`dossier_nom` de `intranet_mes_emails_etat` ->
>   preselection + "classe dans X" au reload.
> - **Reprendre ICI** : items de l'audit prod non couverts par le pivot (fuite contexte
>   eStale hors perimetre dans `get-mes-emails`, garde `choisirGestionnaire`, "Demo" en
>   dur ligne ~490, PII dans les logs Graph), puis backlog section 9 (apprentissage du
>   ton ELRON = priorite qualite).

Contexte initial de la decision (conserve) :

- Sekou a choisi **bloquer "Valider" tant qu'aucune destination** (pas de mail qui part dans le vide).
- Mais le rattachement ne doit pas se limiter aux copros : il faut aussi `Communication agence`, `Spam`, `Perso`, etc., et certains mails vont dans **plusieurs** copros.
- **Direction validee (proposee, a coder)** : remplacer le selecteur "liste de copros Supabase" par un **selecteur des vrais dossiers Outlook de la boite connectee** :
  - lister les dossiers de la boite du gestionnaire connecte (port `listerDossiers(boite)`, on a deja l'enumeration dans `graph-mailbox.ts`),
  - **auto-detection** : presélectionner le dossier copro si une copro est repérée et que son dossier existe ; sinon choix libre (copro / agence / spam / perso),
  - "Classer" = `move` vers le dossier **choisi** (on a son id -> plus de matching par nom), bloque si aucun,
  - persister le dossier choisi (id + nom) ; si dossier copro, en deduire le code pour le contexte eStale.
- **Ca scale aux 43** (on lit la boite du connecte, pas une liste partagee). Confirme a Sekou.
- **Questions ouvertes a Sekou avant de coder** :
  1. Ses dossiers generiques seront **sous "Boite de reception"** ou **a la racine** de la boite ? (pour savoir ou enumerer ; au besoin lister les deux niveaux + racine).
  2. **Multi-copro** : gerer via **categories Outlook** (un mail, plusieurs categories, retrouvable sous chaque copro sans dupliquer) maintenant, ou deferer ?
  3. **Multi-boites par gestionnaire** (boite perso + boites de service `contact@`/`syndic@`/`compta@`) : pas gere aujourd'hui (une boite = celle du connecte). Extension a part si necessaire (cf. ELRON S4).

Implementation pressentie : port `listerDossiers` + `classerDansDossier(folderId)` dans `mailbox-provider`/`graph-mailbox`, exposer la liste au cockpit (service get-mes-emails ou server action lazy), remplacer le selecteur copro du cockpit par un selecteur de dossiers, persister la destination en etat (reutiliser/etendre les colonnes), brancher le blocage.

## 9. Backlog (ordre conseille par la revue ai-engineer + demandes Sekou)

- **P1 reste** : plan a la demande (brouillon genere a l'ouverture du mail, pas pour tous a la synchro -> encore moins de tokens) ; seuil de confiance "a verifier".
- **Envoi** (`Mail.Send`) depuis le cockpit + test Signitic doublon a ce moment.
- **APPRENTISSAGE DU TON (approche ELRON, demande Sekou)** : apprendre le style depuis les mails **ENVOYES** (`mailFolders/sentitems`). v1 = profil de style (1 passe LLM -> guide de style en table `intranet_mes_emails_style` -> injecte dans le prompt + **Mistral Large** + ancrage contexte dossier) ; v2 = RAG (Mistral Embed + pgvector) ; boucle d'auto-correction = profil rafraichi depuis les Envoyes recents. Souverain (Mistral EU, no-training). C'est la **priorite qualite** (reponses trop generiques). Doc source : `C:\Users\SekouKOMA\Projects\Elron`.
- **P2** : affaires **stables** (`intranet_affaires`, IDs sur conversationId + refs), **synchro en tache de fond** + **webhooks Graph** (temps reel, remplace le bouton), reversibilite du classement, watermark/delta d'ingestion (avec affaires stables), multi-copro (categories).

## 10. Decisions actees

- **ADR-026** : persistance des actions du cockpit (table native `intranet_mes_emails_etat`, separee du triage).
- **ADR-027** : ingestion mail en **Application + Access Policy**, pas delegue (le DSI restreint par PowerShell ; synchro de fond possible ; scale par ajout au groupe).
- Signature : **on laisse Signitic faire** (pas d'injection) -> a re-tester a l'envoi.
- Classer : **deplacer dans le dossier** (workflow Sekou), pas une categorie generique.
- ESLint boundaries : nouveaux elements `adapter-fichier`, `adapter-mistral`, `adapter-mail`, `adapter-signitic`.
