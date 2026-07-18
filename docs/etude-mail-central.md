# Étude d'architecture — Réception centralisée des mails métier dans l'intranet

> **But** : fermer la boucle e-mail du cabinet (réception + tri + attribution + suivi) **sans aller-retour manuel** entre eStale et Outlook. eStale reste le **moteur** (envoi, référentiel, actes métier) ; l'intranet devient la **carrosserie** (réception, dispatch, suivi).
>
> **Statut** : étude, lecture seule. Aucun appel réseau. Rien n'est branché à ce stade.
> **Sources** : `docs/estale-schema.graphql` (SDL introspecté, cité avec n° de ligne), module `Mes emails` du repo, ADR-022 / 027 / 028, `docs/estale/apprentissage-estale.md`.

---

## 0. Le problème en une phrase

- **Crypto (ancien)** ingérait les boîtes partagées (type `syndic2@real31.fr`) → archivage + suivi centralisé + continuité en cas d'absence, **mais** ~2 h/jour perdues à dispatcher chaque mail au bon gestionnaire à la main.
- **eStale (nouveau)** envoie richement (mailings copro/agence, ordres de service, demandes aux fournisseurs) **mais ne reçoit rien** : les réponses tombent dans les boîtes Outlook **perso** → zéro archivage, zéro suivi, un collègue absent = trou noir.
- **L'intranet a déjà** une brique de réception (module `Mes emails` : ingestion Graph, tri IA, attribution copro en cascade, classement Outlook, réponse + envoi). Elle est aujourd'hui câblée sur **une boîte = un gestionnaire**. Il faut la faire pivoter vers **des boîtes partagées → un pool d'agence**.

La cible est donc un **assemblage**, pas un développement à partir de zéro.

---

## 1. État des lieux factuel

### 1.1 Ce qu'eStale sait faire à l'ENVOI (types/mutations exacts)

Trois surfaces d'envoi distinctes coexistent dans le schéma :

**a) Mailing (communication de masse copro / agence)** — le mieux outillé.

| Élément | Ligne | Détail |
|---|---|---|
| `createMailingExpress(input: MailingExpressCreateInput!): Mailing!` | 9568 | envoi express en une mutation |
| `createMailing(input): Mailing!` + `updateMailing(id): MailingMutation!` | 9569-9570 | mailing en plusieurs étapes |
| `input MailingExpressCreateInput` | 8064-8076 | `establishmentID`, `category: MailingCategory!`, **`replyto: String`** (8068), `object`, `content`, `ownerIDs: [ID!]!`, `files`, `send: Boolean!` |
| `type Mailing` | 7930 | **`reference: String!`** (7932) = référence générée, `recipients: [MailingRecipient!]!` |
| `MailingMutation` | 8105-8128 | `send`, `print`, `updateMail`, `upsertRecipientsOwner/Supplier`, `updateRecipientsMode(mode: ChannelCategory)` |
| `enum ChannelCategory` | 1674-1683 | `LS, LR, LRAR, ERE, LRE, MAIL, HAND, SMS` (canal par destinataire) |
| `enum MailingCategory` | 7992-7995 | `MARKETING`, `INFORMATIVE` (classification anti-spam, ≠ canal) |
| `MailingRecipient` | 8140 | `email: String`, `sendingMode: ChannelCategory!`, résource = `SupplierContact \| Owner \| MailingRecipientExternal` (8165) |

**b) Ordre de service (OS) / demande fournisseur — `KanbanEventOrder`** (l'agent d'exploration l'avait manqué : l'OS N'est PAS nommé « OS » mais vit dans le module Kanban).

| Élément | Ligne | Détail |
|---|---|---|
| `type KanbanEventOrder` | 6674-6717 | commentaires SDL explicites : *« is the service order urgent? »* (6690), *« order description »* (6684) |
| `reference: String!` | 6682 | **référence unique générée de l'OS** |
| `KanbanEventOrderInput` | 6719-6732 | `title`, `urgent`, `description`, **`sendAs: String!`** (6725), `ownerIDs`, `recipientIDs`, `recipients: MailRecipientsInput`, `schedules: [MailScheduledInput!]` |
| `suppliers: [SupplierEstablishment!]!`, `recipients: [KanbanEventOrderRecipient!]!` | 6701-6703 | destinataires = fournisseurs |
| `createResponse(recipientID, input: KanbanEventOrderResponseInput)` | 6742 | **la réponse d'un fournisseur est enregistrée comme un FICHIER uploadé** (`KanbanEventOrderResponse { label, fileURL }`, 6785 ; input `{ label, file: Upload! }`, 6793), pas comme un mail entrant capté automatiquement |
| `KanbanEventOrderSchedule` | 6804-6836 | e-mail programmé vers le fournisseur : `object`, `body`, `channel: ChannelInfo!`, `sendAs: String!` |

**c) Autres envois transactionnels avec e-mail** :
- `KanbanEventMail` (~6430-6520) : mail libre depuis une carte Kanban (`sendAs`, `body`, `recipients: [MailRecipient!]`, schedules).
- `LitigationDocument.send(input: LitigationDocumentSendInput!)` (7645) — contentieux, **`replyTo: String`** (7655).
- `DriveItemShareInput` (3955) — partage Drive, **`replyTo: String`** (3960).
- `Sale.sendBuyersNotification` (11327), documents de vente `SaleDocumentSendInput.replyTo: Boolean!` (11264, ici un simple toggle, pas une adresse).

### 1.2 Ce qu'eStale ne sait PAS faire (constaté par absence dans le SDL)

- **Aucune réception d'e-mail générique.** Pas de type `Message` / `Conversation` / `Thread` / `Email` entrant. Les réponses aux mailings/OS **ne rentrent nulle part dans eStale**.
- **Aucun webhook, aucune GraphQL Subscription.** Les seuls types racine sont `Query` (10810) et `Mutation` (9506) — **pas de `Subscription`**. eStale ne peut donc **rien pousser** vers l'intranet (ni « nouvelle réponse reçue », ni « OS répondu »). Toute corrélation devra être faite par **pull + rapprochement côté intranet**.
- **Seule surface entrante existante** : des adresses `inbox: String!` d'**ingestion de factures** (`CondoInvoice.inbox` 2236, `PayoutCollaborator.inbox` 10494, `PayinCollaborator.inbox` 10560), encadrées par une whitelist d'expéditeurs (`EstablishmentSettingsMailboxInvoice` 5436, `InvoiceWhitelistMail` 6326). C'est pour **faire entrer des factures**, pas des réponses métier. À noter comme précédent : eStale sait recevoir sur une adresse dédiée, mais uniquement dans ce cadre fermé.
- **Adresse d'EXPÉDITION non configurable.** Aucun champ `from` / `sender` / `expediteur` nulle part dans le schéma. On ne choisit pas l'adresse d'envoi ; eStale route avec sa propre infra.

### 1.3 Ce que l'intranet sait DÉJÀ faire (module `Mes emails`, brique par brique)

Tout est derrière des **ports** (archi hexagonale, ADR-001), donc réutilisable/extensible sans toucher l'UI.

| Brique | Fichier | Réutilisable pour boîtes partagées ? |
|---|---|---|
| **Ingestion Graph app-only** d'une boîte | `lib/adapters/mail/graph-mail-ingestion.ts` — `GET /users/{boite}/mailFolders/inbox/messages`, pagination, token client-credentials (`graph-auth.ts`) | **Oui, tel quel.** `boite` est déjà un **paramètre** (`opts.email`). L'adapter est agnostique perso/partagée : seul l'Access Policy et l'orchestration changent. |
| **Port d'ingestion** | `lib/ports/mail-ingestion-provider.ts` (`lireRecents({ email, max })`) | Oui. |
| **Tri IA Mistral** (mail → `TypeMail`) | `lib/services/mes-emails/synchroniser.ts` + `getAnalyseMailProvider` ; cache par `internetMessageId` (table `intranet_mes_emails_triage`) → jamais 2× le même mail au LLM | Oui, indépendant de la boîte. |
| **Attribution copro en CASCADE** | `synchroniser.ts` : (1) code/nom/adresse dans l'objet+corps `attribuerCopro`, (2) héritage par fil de conversation, (3) **annuaire Crypto** `email→copro` (`crypto-contacts-provider.ts`, table `intranet_crypto_contacts`, ~7,6k paires) — attribution **seulement si UNE seule copro** (anti-ambiguïté) | Oui. La cascade est le cœur réutilisable. **Manque** : l'attribution du bon **gestionnaire** (aujourd'hui la boîte EST le gestionnaire). |
| **Classement dans les vrais dossiers Outlook** | `lib/adapters/mail/graph-mailbox.ts` (`listerDossiers`, `classerDansDossier`, matching code/nom copro, `POST .../move`) | Oui, `boite` paramétrable. |
| **Visionneuse PJ** | `pieces-jointes.ts` + port `mailbox-provider.ts` | Oui. |
| **Réponse + signature Signitic** | `graph-mail-outbound.ts` (`createReply` → PATCH corps + destinataires → send) ; signature via `signitic-signature-provider.ts` (`GET /signatures/{email}/html`) | Oui pour la réponse. **Signature = par personne** (clé = email) → à réfléchir pour une boîte partagée (signature de l'agence ? du gestionnaire qui répond ?). |
| **Mail neuf** (`envoyerNeuf` / `creerBrouillonNeuf`) | `graph-mail-outbound.ts` (`sendMail` / `POST /messages`), ADR-028 | Oui. |
| **Double gate** | `lib/auth/session.ts` : `MAIL_SOURCE=graph` (global) + `MAIL_PILOTES` (allowlist d'emails) | Oui — sert à un déploiement progressif. |
| **Cloisonnement** | `app/mes-emails/actions.ts` : `withGestionnaire` (identité serveur, jamais client), zod sur tous les endpoints | À **repenser** pour le pool (cf. §5). |

**Limite structurante actuelle** (ADR-027, commentaire `actions.ts:38-43`) : le cockpit lit **la propre boîte du gestionnaire connecté**. Le cloisonnement copro y est même **désactivé** en mode Graph, précisément parce que « chaque mail lui appartient ». La bascule vers des boîtes partagées **inverse ce postulat** : un mail de `syndic2@` n'appartient à personne a priori → il faut l'**attribuer**. C'est le vrai travail neuf.

> Point d'architecture à garder en tête : **l'intranet envoie via Graph (Mail.Send / sendMail), PAS via eStale.** eStale envoie ses propres actes (mailings, OS). Les deux moteurs d'envoi coexistent. « Envoi via eStale » dans la vision de Sekou = les **actes métier** (mailings copro, OS) partent d'eStale ; les **réponses** et les mails de coordination passent par Graph/l'intranet.

---

## 2. Architecture cible proposée

### 2.1 Schéma de la boucle fermée

```
                 ENVOI (2 moteurs)                         RÉCEPTION (1 point d'entrée)
   ┌─────────────────────────────────┐          ┌──────────────────────────────────────┐
   │ eStale : Mailing copro/agence    │          │  Boîtes PARTAGÉES par agence          │
   │        + OS (KanbanEventOrder)   │  reply   │  syndic@ / syndic2@ / syndic3@ ...     │
   │   → replyto = syndic{n}@ (mailing)├─────────▶│                                       │
   │   → OS : reply-to NON réglable    │          │  Intranet ingère (Graph, multi-boîtes)│
   │     (cf. §2.3, question eStale)   │          │        │                              │
   ├─────────────────────────────────┤          │        ▼ tri IA (TypeMail)            │
   │ Intranet : réponses + coordination│          │        ▼ ATTRIBUTION AUTO gestionnaire│
   │   via Graph (Mail.Send), reply-to │          │          (cascade + référentiel)      │
   │   naturel = la boîte partagée      │◀─────────┤        ▼ corrélation acte eStale (ref)│
   └─────────────────────────────────┘          │        ▼ suivi pool (traité/non traité)│
                                                  └──────────────────────────────────────┘
```

### 2.2 Les composants (existant vs à construire)

1. **Ingestion multi-boîtes partagées** — *étend l'existant*. L'adapter Graph prend déjà `boite` en paramètre. Il faut une **liste de boîtes** à ingérer (config ou table) et une boucle de synchro par boîte. La synchro actuelle prend `g.email` (le gestionnaire) ; on la généralise à `pour chaque boîte partagée d'agence`.

2. **Tri IA** — *tel quel*. `TypeMail` (panne, sinistre, demande copro/CS, devis, facture, compta, AG/CS, VEFA…) déjà en place, caché par `internetMessageId`.

3. **Attribution AUTO du gestionnaire** — *le principal travail neuf*. Aujourd'hui la cascade attribue la **copro** ; il faut ajouter **copro → gestionnaire**. On a déjà `coproAppartient(coproCode, managerId)` et `getCoproRepository().list(g.id)`. Il suffit d'inverser : `copro → managerId` via le référentiel (Supabase `managerId`, demain eStale `condo.manager`). Une fois la copro connue (cascade existante), le gestionnaire en découle. **C'est ce qui tue les 2 h/jour de dispatch.**

4. **Corrélation aux actes eStale** — *à construire, best-effort*. Contrainte dure (§1.2) : pas de webhook. La corrélation ne peut être qu'un **rapprochement côté intranet** :
   - par **référence** : `Mailing.reference` (7932) et `KanbanEventOrder.reference` (6682) sont des chaînes générées ; **si** eStale les fait apparaître dans l'objet du mail sortant, un mail entrant qui les cite (objet en `Re:`) est corrélable par simple recherche de motif ;
   - par **adresse expéditeur** : le fournisseur/copropriétaire qui répond est un `SupplierContact` / `Owner` connu d'eStale → rapprochement email→ressource (même logique que l'annuaire Crypto).
   - Réaliste : viser d'abord le rapprochement **copro + type**, et n'ajouter la corrélation fine à l'OS/mailing que si la référence transite bien dans l'objet (à vérifier en réel).

5. **Suivi centralisé / pool d'agence** — *à construire*. Vue « toutes les boîtes de l'agence », statut **traité / non traité / en cours**, qui a pris quoi, réassignation. L'état persiste déjà par mail (`intranet_mes_emails_triage`, statut/étapes/brouillon) ; il faut le **dé-cloisonner** de « un gestionnaire » vers « une agence » et ajouter un axe « assigné à ».

6. **Rattachement dossier + archivage** — *l'existant pointe déjà là* : `rattacherADossierAction` / `creerDossierDepuisMailAction` (module Dossiers, `intranet_dossiers`) + classement Outlook. À conserver, en scope agence.

### 2.3 La clé de voûte : le reply-to eStale (découverte)

**C'est le point qui ferme la boucle sans aller-retour. Verdict nuancé, vérifié dans le SDL :**

- ✅ **Mailings : reply-to CONFIGURABLE.** `input MailingExpressCreateInput.replyto: String` (ligne 8068), idem `MailingMailInput.replyto` (8091), `MailingMailPreviewInput.replyto` (8099), et sur les modèles `MailingTemplateMail.replyTo` (8176) / `MailingTemplateMailInput.replyto` (8187). → **On peut dire à eStale : « les réponses à ce mailing → `syndic{n}@real31.fr` ».** La boucle se ferme nativement pour tous les mailings copro/agence.
- ✅ **Défaut par établissement (agence)** : `replyToEmail: String!` + `replyToMode: String!` sur les réglages d'invitation/PV d'AG (`EstablishmentSettingsAssemblyInvitation` 4700-4701, transcript 4753-4754) et d'appels de fonds (5176-5206). → une adresse de réponse **par établissement**, réglable une fois. À exploiter : y mettre la boîte partagée de l'agence.
- ⚠️ **OS (`KanbanEventOrder`) : reply-to NON exposé.** Ni `KanbanEventOrderInput`, ni `MailScheduledInput` (7915), ni `MailRecipientsInput` (7899, juste `to/cc/bcc`) n'ont de `replyto`. Le seul champ proche est **`sendAs: String!`** (6725) = un libellé d'affichage (« envoyé en tant que… », borné par `maxSendAsLen`), pas une adresse de réponse. → **On ne peut pas, depuis le schéma, forcer les réponses d'un OS vers la boîte partagée.** Les réponses fournisseurs suivront le routage par défaut d'eStale (invisible ici), OU seront à faire remonter manuellement via `createResponse` (upload de fichier).

**Conséquence pour l'architecture** : la boucle se ferme **nativement pour les mailings** (majorité du volume copro), et **partiellement pour les OS** (à confirmer avec eStale — voir question Q2, §5). C'est une bonne nouvelle : le gros du volume externe (communications copro) est couvert par `replyto`.

### 2.4 Pourquoi « zéro aller-retour »

- Le gestionnaire n'ouvre **jamais** eStale pour voir une réponse : elle arrive dans la boîte partagée, l'intranet la trie, l'attribue à lui, la corrèle si possible. Il la traite **dans le cockpit**.
- Il ne re-saisit **rien** : la réponse est déjà rattachée à la copro (cascade) et au gestionnaire (référentiel). Le rattachement au dossier/OS est proposé, pas ressaisi.
- Continuité : un collègue absent → le **pool d'agence** voit et reprend, exactement ce que Crypto offrait, sans les 2 h/jour de dispatch (l'IA + la cascade font le tri).

---

## 3. Convention d'organisation des boîtes (à proposer au cabinet)

Règle simple, tenable pour 43 personnes, 4 agences :

| Type de communication | Adresse | Pourquoi |
|---|---|---|
| **Externe — copropriétaires, entreprises, fournisseurs** (tout ce qui doit être archivé/suivi/repris en cas d'absence) | **Boîte partagée d'agence** `syndic@` / `syndic2@` … | Point d'entrée unique, ingéré par l'intranet, dispatch auto. C'est ici que se joue la fin des 2 h/jour. |
| **Envois eStale (mailings copro/agence)** | `replyto` = la boîte partagée de l'agence | Ferme la boucle nativement (§2.3). |
| **Interne — collègues, DSI, RH** | Adresse **perso** `prenom.nom@real31.fr` | Pas de valeur à centraliser ; bruit en moins dans le pool. |
| **Conseil syndical + urgences nécessitant réponse rapide** | Adresse **perso** (statu quo) | Relation de confiance directe ; le CS attend une réponse nominative. |

**Migration douce** : on **n'impose pas** aux 43 de tout changer d'un coup. On commence par **rediriger le `replyto` des mailings eStale** et par **ingérer les boîtes partagées existantes** (`syndic2@` est déjà utilisée). La convention se déploie agence par agence (dernier incrément), pas en big bang.

---

## 4. Plan d'incréments (du plus sûr au plus engageant)

| Inc. | Contenu | Existe déjà | À construire | Effort | Dépendance |
|---|---|---|---|---|---|
| **1** | **Ingestion multi-boîtes partagées + attribution auto gestionnaire.** Ingérer 1-2 boîtes partagées ; cascade copro existante ; ajout `copro → managerId` ; badge « pour X ». | Adapter Graph (`boite` paramétrable), tri IA, cascade copro, table triage | Liste de boîtes (config/table) ; boucle de synchro par boîte ; résolveur `copro→gestionnaire` ; UI « attribué à » | **M** | Access Policy inclut `syndic@` (Q1) |
| **2** | **Vue pool/agence + suivi + réassignation.** Écran « boîte agence » : traité / non traité / en cours, qui traite, réassigner à un collègue. | État par mail (statut/étapes) persistant | Dé-cloisonnement gestionnaire→agence ; axe « assigné à » ; filtres pool ; réassignation | **M** | Inc. 1 |
| **3** | **Corrélation actes eStale (best-effort).** Rapprocher une réponse au `Mailing.reference` / à l'`Owner`/`SupplierContact` expéditeur. | Cascade email→copro (annuaire) ; lecture eStale (ports) | Rapprochement par référence (si dans l'objet) + par ressource ; affichage « réponse au mailing REF… » | **M→L** | Vérifier en réel que la référence transite dans l'objet |
| **4** | **Rattachement dossier intranet + archivage.** Réponse → dossier `intranet_dossiers` + classement Outlook, en scope agence. | `rattacher/creerDossierDepuisMail`, classement Outlook | Adapter les actions au scope agence ; règles d'archivage | **S→M** | Inc. 2 |
| **5** | **reply-to eStale + convention déployée.** Régler `replyto` (mailings) / `replyToEmail` (établissement) sur les boîtes partagées ; déployer la convention agence par agence. | Mutations mailing eStale (non branchées à ce jour) | Branchement écriture eStale `replyto` ; conduite du changement ; onboarding des 43 | **M** (+ organisationnel) | eStale prod ; Q2 (OS) ; adhésion cabinet |

> **Note** : les mutations d'envoi eStale (`createMailingExpress`, `KanbanEventOrder…`) **ne sont branchées nulle part dans le code aujourd'hui** (vérifié : `lib/adapters/estale/` n'appelle aucun `Mailing`/`createMailing`). L'intranet lit eStale mais n'y écrit pas encore d'actes de comm. L'Inc. 5 est donc le premier à **écrire** un acte d'envoi eStale — cohérent avec la stratégie défensive ADR-022 (écriture parcimonieuse, derrière un port).

**Ordre de sûreté** : Inc. 1-2 n'ont **aucune dépendance eStale** (100 % Graph + Supabase) → valeur immédiate (fin du dispatch manuel) même avant la bascule eStale de janvier. Inc. 3 et 5 dépendent d'eStale et des réponses du support.

---

## 5. Questions à trancher

**Priorité haute :**

1. **Access Policy Exchange — couvre-t-elle les boîtes partagées ?** (DSI) L'`Application Access Policy` (ADR-027) borne l'app Graph à un **groupe** `REAL31-Intranet-MailRead`. Aujourd'hui il contient les boîtes des gestionnaires pilotes. **`syndic@` / `syndic2@` y sont-elles ?** Sinon : `Add-DistributionGroupMember` sur le groupe (une commande par boîte, pas par salarié). Vérifier aussi que `Mail.Send`/`Mail.ReadWrite` (répondre depuis la boîte partagée) sont bien couverts par la policy — l'audit `docs/audit-perf-securite-2026-06-29.md` (C2) signale que l'existence/le scope réel de la policy **ne sont pas garantis par le repo**. **Sans policy correcte, tout le cloisonnement mail tombe.**

2. **reply-to eStale sur les OS — où tombent les réponses fournisseurs ?** (support eStale) Le SDL montre `replyto` sur les **mailings** mais **rien sur `KanbanEventOrder`** (seul `sendAs`, un libellé). Question exacte à poser : *« Pour un OS (KanbanEventOrder) envoyé par e-mail à un fournisseur, quelle est l'adresse de réponse (Reply-To) réellement posée ? Est-elle réglable — au niveau de l'établissement, de l'OS, ou pas du tout ? La réponse du fournisseur peut-elle être routée vers une adresse que nous contrôlons (`syndic{n}@real31.fr`), ou seul le mécanisme `createResponse` (upload manuel de fichier) est-il prévu ? »* La réponse conditionne l'Inc. 3 pour les OS.

3. **Cloisonnement vs pool — qui voit quoi ?** (Sekou / direction) La bascule vers boîtes partagées **inverse** le postulat actuel (« chaque mail appartient au connecté », ADR-027). Décider : le pool d'agence voit-il **tous** les mails de l'agence (continuité maximale, façon Crypto) ou seulement ceux de son périmètre copro ? Impacte la RLS et l'UI. Recommandation : **pool visible par agence** (c'est l'intérêt vs Outlook perso), avec attribution nominative par-dessus.

**Priorité moyenne :**

4. **RGPD / archivage** (Sekou / DPO) : durée de conservation dans `intranet_mes_emails_triage`, base légale du stockage de mails de copropriétaires, articulation avec l'archivage Outlook. Rappel : `data/Export crypto/listes_diffusion_*.csv` contient déjà de la PII copropriétaires (cf. audit préprod) — même vigilance ici.
5. **Signature sur boîte partagée** : Signitic est clé par **email de personne** (`signitic-signature-provider.ts`). Quelle signature sous une réponse envoyée depuis `syndic@` — celle de l'agence, ou celle du gestionnaire qui répond ? À trancher au niveau produit.
6. **Volume & fréquence de synchro** : cron de fond (ADR-027 l'anticipe) vs synchro sur ouverture. Combien de boîtes partagées, quel volume/jour ?

---

## 6. Risques honnêtes

- **Dépendance au tri IA.** L'attribution auto repose sur Mistral + la cascade. Un mauvais classement = mauvais gestionnaire. Atténuation existante : attribution **seulement si UNE seule copro** (anti-faux-positif), réassignation manuelle (Inc. 2), et le pool voit les non-attribués. Le tri IA a déjà connu des ratés (clé Mistral absente → mock silencieux, cf. ROADMAP) : prévoir un état « non attribué, à dispatcher » visible, jamais une attribution silencieuse erronée.
- **Rate limits Graph.** Ingérer N boîtes partagées × pagination, potentiellement en cron, multiplie les appels `/users/{boite}/messages`. Prévoir throttle + `$top`/pagination bornée (déjà en place, `PAGE=50`) et une fréquence raisonnable. Idem `resoudreMessageId` (un appel par action).
- **Pas de webhook eStale = pas de temps réel sur la corrélation.** Toute corrélation est un **pull + rapprochement**. Si la référence eStale ne transite pas dans l'objet du mail, la corrélation fine à l'acte est impossible — on retombe sur copro+type (déjà utile). Ne pas survendre l'Inc. 3.
- **Corrélation OS fragile** (cf. Q2). Tant qu'eStale n'a pas répondu, considérer les réponses d'OS comme de simples mails entrants triés par copro, sans lien automatique à l'OS.
- **Ce que Crypto faisait qu'on ne répliquera pas (assumé)** : l'ingestion des **sous-dossiers/historique** est abandonnée par design (l'intranet lit `mailFolders/inbox` racine uniquement, cf. ROADMAP — « pas de bug, choix »). Pas de reprise de l'historique mail Crypto ; on démarre au fil de l'eau. À assumer explicitement auprès du cabinet.
- **Inversion du modèle de cloisonnement** (ADR-027). Le code actuel **désactive** le cloisonnement copro en mode Graph parce que « la boîte = le gestionnaire ». Passer aux boîtes partagées demande de **réactiver et repenser** ce cloisonnement (Q3) — ce n'est pas un simple paramètre, c'est une décision d'archi à tracer en ADR avant de coder l'Inc. 1-2.
- **Double moteur d'envoi** (Graph + eStale) : deux chemins, deux comportements de reply-to, deux endroits où une signature/adresse peut diverger. Documenter clairement « quel envoi passe par quoi » pour éviter la confusion des utilisateurs.

---

## Annexe — références de schéma citées (docs/estale-schema.graphql)

`ChannelCategory` 1674 · `Agency` 349 (pas d'email) · `Collaborator.email` 1846, `signing` 1864 · `KanbanEventMail` ~6430 · `KanbanEventOrder` 6674, `.reference` 6682, `Input` 6719, `Mutation.createResponse` 6742, `Response` 6785, `Schedule` 6804 · `Litigation.reference` 7459, `LitigationDocumentSendInput.replyTo` 7655 · `MailRecipientsInput` 7899 · `MailScheduledInput` 7915 · `Mailing` 7930, `.reference` 7932 · `MailingCategory` 7992 · `MailingExpressCreateInput.replyto` 8068 · `MailingMailInput.replyto` 8091 · `MailingMutation` 8105 · `MailingTemplateMail.replyTo` 8176 · `EstablishmentSettingsAssemblyInvitation.replyToEmail` 4701 · `EstablishmentSettingsMailboxInvoice` 5436 · `CondoInvoice.inbox` 2236 · `createMailingExpress` 9568 · racines `Mutation` 9506 / `Query` 10810 (pas de `Subscription`).
