# Intégrer « Suivi des Contrats Copros » dans real31.app : analyse et plan

> Document de Phase 2 (analyse + plan), rédigé le 15/10/2026 après lecture complète des deux applications et mesure de la base de production. **Aucun code n'a été écrit.** Les 12 arbitrages ont été **tranchés par Sekou le 16/10/2026** (§9) ; le plan ci-dessous les intègre. Ticket Linear : REA-333.
> 
> Source analysée : `C:\Users\SekouKOMA\Projects\Suivi-contrats-Copros-main` (Next 14, Prisma 5, Auth.js, Tailwind 3, 2 319 tests). Cible : ce dépôt (Next 16, archi hexagonale, supabase-js).

---

## 0. Ce qu'il faut savoir avant tout : les deux applis partagent déjà la même base

C'est le fait qui change toute la lecture du chantier.

- La base Supabase `lgrsnrclufsulglbwcqi` que l'intranet appelle « la base patron / App A » **est la base de l'application Suivi des Contrats Copros**. Les tables `public."Copropriete"`, `"User"`, `"Agency"` que l'intranet lit et écrit partout (fiche copro, facturation, propositions, collaborateurs, dates AG/CS, perte de copro) sont le référentiel de cette application, défini dans son `prisma/schema.prisma`.
- L'intranet ne touche à **aucune** de ses tables de suivi (`InsuranceTracking`, `ElevatorCtq`, `GasVmcCtq`, `GasContractTracking`, offres, devis, documents, contacts). Il n'y fait que trois liens externes vers `contratscopro.real31.app` (onglet « Contrats » de la fiche copro, barre latérale, formulaire de remontées).
- Inversement, l'application source lit une table de l'intranet en SQL brut : `intranet_listes_diffusion` (adresses du conseil syndical) pour ses mails au CS.
- Les deux applis se marchent déjà dessus : l'intranet a ajouté les rôles `COMPTABLE`, `GESTIONNAIRE_LOCATIVE`… dans `User.role`, ce qui a fait planter Prisma côté source le 06/10/2026 (journal phase 6). Deux ORM sur une même table, c'est précisément la dette qu'ADR-021 avait nommée.

**Conséquence** : il n'y a pas de « migration de données » au sens classique. Le référentiel est déjà commun. Le chantier consiste à **rapatrier la logique métier et les écrans** dans l'intranet, à **réutiliser ses services** (auth, mail, SharePoint, modèles, périmètre, UI) à la place de la plomberie dupliquée, et à **décider table par table** ce qu'on garde tel quel, ce qu'on fusionne et ce qu'on abandonne.

### L'application est utilisée tous les jours

Mesuré en base le 15/10/2026 (lecture seule) :

| Donnée                                                            | Valeur                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Copropriétés (ACTIVE / INACTIVE)                                  | 260 / 11 (dont 10 marquées ESTALE)                         |
| Cycles assurance (en cours / clos / archivés courtier partenaire) | 62 / 16 / 143                                              |
| Cycles CTQ ascenseur (en cours / clos), ascenseurs                | 272 / 10, 272 appareils                                    |
| Cycles CTQ VMC gaz                                                | 6 en cours                                                 |
| Cycles contrat gaz (en cours / clos)                              | 72 / 3                                                     |
| Offres assurance / offres gaz / devis CTQ                         | 12 / 21 / 13                                               |
| Documents déposés dans SharePoint                                 | 39 (25 assurance, 12 gaz, 2 CTQ)                           |
| Contacts (ascensoristes / fournisseurs gaz / courtiers)           | 23 / 10 / 4, 152 liens copro-ascensoriste                  |
| Points de remédiation post-CTQ, notifications in-app              | **0 et 0** (jamais utilisés)                               |
| Mails envoyés au conseil syndical (gaz, assurance, CTQ)           | 8 entre le 17/07 et le 24/09                               |
| Utilisateurs actifs dans le journal                               | 16 en juillet, 5 en août, 3 en septembre, **9 en octobre** |

Le dernier geste métier date du **15/10 à 13:54** (Mathilde Arleri, clôture d'un cycle). Emmanuel, Fanny, Chrystelle, Nicolas, Mahaut, Titouan, Océane, Julie, Galiano y travaillent. Les crons de rappel (`run-reminders`, `check-overdue`) n'ont **jamais été armés** en production : exposition mesurée par l'auteur le 10/10 à 97 suivis « rouges » au premier passage, dont 19 avec des dates d'amorçage aberrantes (1906, 1930, 2017).

---

## 1. L'application source : ce qu'elle fait vraiment

### 1.1 Le métier

Quatre **sujets de suivi** sur une copropriété, tous bâtis sur le même patron (échéance, étapes datées, offres, clôture qui ouvre le cycle suivant) :

| Sujet                                          | Rattaché à           | Étapes datées                                                                                               | Échéance suivante                                           | Pré-condition                                                                                                                                                 |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assurance multirisque immeuble                 | copro                | 6 : relevé de sinistralité demandé / reçu, offres demandées / reçues / présentées, offre validée            | saisie à la main à la validation (l'offre n'a pas de durée) | toujours, sauf copro chez un **courtier partenaire** (Areas, Dissoubray, Galian-Smabtp, Paris Tronchet) : le suivi est alors archivé, le courtier s'en charge |
| Contrat gaz                                    | copro                | 4 : devis demandé / reçu / présenté, offre validée                                                          | validation + durée de l'offre (mois)                        | `boilersCount > 0` et énergie de chauffage GAZ                                                                                                                |
| CTQ ascenseur (contrôle technique quinquennal) | **chaque ascenseur** | 7 : devis demandé / reçu / présenté / validé, CTQ réalisé, transmis à l'entreprise, devis entreprise obtenu | date du CTQ + 5 ans                                         | ascenseurs déclarés                                                                                                                                           |
| CTQ VMC gaz                                    | copro                | les 7 mêmes                                                                                                 | date du contrôle + 5 ans                                    | `gasVmcCount > 0`                                                                                                                                             |

Règles métier **validées par les directeurs** (réunions des 06 et 07/06/2026, `docs/phase-6/DECISIONS_DIRECTEURS_*.md`, D1 à D15) :

- **Niveau d'alerte = dossier figé, pas échéance imminente.** Une fenêtre s'ouvre à `échéance − N jours` (180 assurance, 90 gaz, 120 CTQ). À partir de là, si aucune étape intermédiaire n'est franchie depuis 30 jours : orange ; 60 jours : rouge. Franchir une étape remet le compteur à zéro. Le rouge met le directeur référent en copie du rappel. Pas d'échéance saisie = « à compléter », jamais vert par défaut.
- **Clôture atomique** : dater la terminale clôt le cycle et crée le suivant dans la même transaction. Une terminale est re-datable (ajuste la seule échéance du cycle suivant). Les étapes intermédiaires se dé-cochent, pas les terminales. Pas de date future (heure de Paris).
- **Offres** : valider une offre, la sélectionner et clôturer est un seul geste. L'offre élue recopie ses champs sur la copro (fournisseur, type de prix, montant, échéance). Une offre élue ne se modifie pas et ne se supprime pas ; une offre non retenue, oui.
- **Devis CTQ** au niveau de la copro (un devis couvre l'immeuble), un devis retenu par sujet.
- **Cycle « à démarrer »** : un cycle d'amorçage sans aucune activité reste replié tant qu'on n'a pas cliqué « Démarrer le suivi ».
- **Action groupée** : dater une étape pour tous les ascenseurs d'une copro d'un coup (37 % de copros multi-ascenseurs).
- **Compteurs d'équipement** : `0` = pas concerné, `null` = jamais renseigné (file « à compléter »).

### 1.2 Les écrans

| Écran                                             | Rôle                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accueil                                           | 4 cartes structurelles (total, ascenseurs, VMC, gaz) + 4 cartes de niveau (rouge / orange / vert / à compléter) sur le périmètre personnel                                                                                                                                      |
| Copropriétés                                      | liste avec badge agrégé (pire niveau des suivis), filtres niveau / sujet / agence / gestionnaire / équipement, recherche normalisée                                                                                                                                             |
| Fiche copro                                       | en-tête (identité, compteurs, équipe, contrats courants) + 4 sections de suivi : cycles, étapes, offres ou devis, documents, bouton mail au CS, bouton « corriger les données »                                                                                                 |
| Infos générales                                   | formulaire « registre national » (chauffage, ECS, ventilation, bornes, PPT, étiquettes), bâtiments, compteurs, champs « métier courant » (dates AG/CS, Pennylane, panier BPO…)                                                                                                  |
| Assurance / CTQ ascenseur / VMC gaz / Gaz contrat | 4 listes par sujet, tri par colonnes                                                                                                                                                                                                                                            |
| Vue directeur                                     | les 4 listes fusionnées, filtres client, réservée directeurs/admin                                                                                                                                                                                                              |
| À compléter                                       | file de qualité de données par gestionnaire (assurance sans échéance, ascenseur sans date de CTQ, gaz sans fournisseur, CS sans adresse, immatriculation manquante, compteurs incohérents, suivis à démarrer), édition en ligne, sélecteur de collaborateur pour les directeurs |
| Compléter les bâtiments                           | outil de saisie du registre national, réservé aux agences LGC et HLS                                                                                                                                                                                                            |
| Admin                                             | utilisateurs, carnet de contacts, seuils de relance, modèles de mail (6), journal d'audit                                                                                                                                                                                       |
| Aide                                              | notice de la page « À compléter »                                                                                                                                                                                                                                               |

### 1.3 La plomberie (ce qui n'est pas du métier)

Auth.js + Entra ID avec sa propre table `User` et son auto-provisioning, `coproScopeWhere` + `canWriteCopro` (modèle C des directeurs), 27 routes PATCH « une route par champ », `mutations.ts` de 4 288 lignes, client Graph maison (mail « au nom du collaborateur », dépôt SharePoint sous `{dossier copro}/Contrats/{module}`), Signitic, tables `Notification`, `AuditLog`, `ReminderRule`, `EmailTemplate`, `Session`, `MagicLinkToken`, 15 importateurs CLI SharePoint/Excel d'amorçage (travail fait, one-shot), générateurs de gabarits Excel, deux crons Vercel jamais armés.

---

## 2. Ce que l'intranet a déjà (recoupements)

| Besoin de l'app source                    | Dans l'intranet                                                                                                                                                                                                                                     | Verdict                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Référentiel copros, agences, utilisateurs | les **mêmes tables** `Copropriete`, `Agency`, `User`, lues via `SupabaseCoproRepository` (33 colonnes sur 62)                                                                                                                                       | commun, rien à migrer                                            |
| Auth SSO, rôles, périmètre                | `getGestionnaireCourant`, rôles + habilitations + délégations, **ADR-041** « une seule porte » `coproAppartient` (portefeuille, rôle, délégations), vue portefeuille / agence / cabinet                                                             | réutiliser, abandonner le modèle C                               |
| Fiche copro                               | `/copropriete/[code]`, onglets Vue d'ensemble / Événements / Dossiers / Clés / Comptabilité, **onglet « Contrats » = lien externe** ; bloc Conformité lit déjà `insuranceDueDate` et `lastGasVmcCtqDate`                                            | l'onglet Contrats devient interne                                |
| Dates AG/CS, PPT, Pennylane, facturation  | portés par l'intranet (ADR-023, module facturation, propositions)                                                                                                                                                                                   | l'app source ne doit plus les éditer                             |
| Immatriculation                           | « la clé d'un immeuble » (ADR-039), registre national ANAH en base (`intranet_registre_copros`, 85 564 lignes) avec autocomplétion                                                                                                                  | mieux que la saisie à la main de la source                       |
| Conseil syndical (destinataires)          | cascade `destinataires-conseil.ts` : annuaire Crypto, CS eStale, liste de secours `intranet_listes_diffusion`                                                                                                                                       | remplace le SQL brut de la source                                |
| Envoi de mail                             | port `MailOutboundProvider` (Graph app-only, `envoyerNeuf` / `creerBrouillonNeuf`, pièces jointes, Cci, signature Signitic), garde-fou ADR-047                                                                                                      | réutiliser                                                       |
| Modèles de mail                           | `intranet_mail_modeles` + écran `/admin/modeles-mail` + variables `{{…}}`                                                                                                                                                                           | y migrer les 6 modèles                                           |
| Dépôt SharePoint                          | port `DepotDocumentProvider` (Graph, Sites.Selected, PUT < 4 Mo sous `copro.sharepointUrl`)                                                                                                                                                         | réutiliser, à étendre (créer un sous-dossier, lister, supprimer) |
| Référentiel d'entreprises                 | `intranet_cles_entreprise` (nom normalisé unique, contacts, `estale_supplier_id`), écrans `/cles/entreprises`                                                                                                                                       | candidat à la fusion avec `Contact`                              |
| Rappels par mail + idempotence            | cron `rappel-comptes-cs` + `intranet_rappels_envoyes`                                                                                                                                                                                               | même patron pour les échéances                                   |
| Blocs « à faire » de l'accueil            | `alerte-mandats-sans-ag`, `alerte-cles-en-retard`, `alerte-recaps-en-retard`                                                                                                                                                                        | même patron pour les suivis rouges / à compléter                 |
| Journal                                   | journaux par module (table immuable `intranet_cles_mouvement`, `journal jsonb`), composant `ui/journal`                                                                                                                                             | même patron                                                      |
| Composants UI                             | `Page`, `Section`, `Stat`, `Table`, `Badge`, `Modal`, `Field`, `Tabs`, `useConfirm`, `useToast`, barres de recherche libres                                                                                                                         | tout le visuel vient de là                                       |
| eStale                                    | `SupplierContract` (catégories INSURANCE_MULTI_RISK, ENERGY_GAS, LIFT_MAINTENANCE, CONTROLLED_MECHANICAL_VENTILATION), `CondoServiceBookElevator` (contrôle quinquennal), `Building`, `registrationNum` : le schéma existe, seul `contracts` est lu | la cible de long terme derrière le port                          |

Ce que l'intranet **n'a pas** : table de documents (pointeurs), notifications in-app, écrans ascenseurs / bâtiments / contrôles, référentiel assureurs ou courtiers.

---

## 3. Inventaire des fonctionnalités et verdict

Légende : ✅ reprendre telle quelle · 🔧 reprendre en l'améliorant · 🔁 déjà couverte, réutiliser l'existant · ❌ abandonner.

### Cœur métier

| #   | Fonctionnalité                                                                                                     | Verdict | Justification                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Les 4 sujets, leurs étapes, le calcul du niveau (fenêtre, 30 / 60 jours, étapes intermédiaires), « à compléter »   | ✅       | règles validées par les directeurs, prouvées à l'usage ; réécrites en fonctions pures de domaine (l'original les a déjà isolées : `suivis.ts`, `qualification.ts`)                                  |
| 2   | Clôture atomique + cycle suivant, re-clôture, dé-cochage des intermédiaires, pas de date future                    | ✅       | D3, D4, D7, D9                                                                                                                                                                                      |
| 3   | Offres assurance et gaz : saisie, suppression si non élue, validation = sélection + clôture + recopie sur la copro | ✅       | D10 à D13                                                                                                                                                                                           |
| 4   | Devis CTQ au niveau copro, devis retenu par sujet                                                                  | ✅       | D35 à D37                                                                                                                                                                                           |
| 5   | Courtier partenaire archive le suivi assurance                                                                     | ✅       | D-DATA-24, 143 cycles archivés en dépendent                                                                                                                                                         |
| 6   | « Démarrer le suivi » (cycles d'amorçage repliés)                                                                  | 🔧      | utile tant que l'amorçage n'est pas digéré ; dans l'intranet c'est un état dérivé affiché replié, pas une colonne `manuallyStarted` à expliquer                                                     |
| 7   | Action groupée sur les ascenseurs d'une copro                                                                      | ✅       | nécessaire à l'usage (89 copros multi-ascenseurs à dates communes)                                                                                                                                  |
| 8   | Points de remédiation post-CTQ + mail automatique au prestataire en retard (`check-overdue`)                       | ❌ en V1 | **0 point créé en 4 mois**, cron jamais armé, mécanique la plus lourde (carnet de contacts principal par type, relance périodique). À rouvrir sur demande terrain, le patron du cycle l'accueillera |
| 9   | Compteurs d'équipement, correction des incohérences                                                                | ✅       | déclaratif sur `Copropriete`, pilote les pré-conditions                                                                                                                                             |
| 10  | Descriptif VMC (société, référence), fournisseur gaz, type de prix, montant                                        | ✅       | champs du contrat courant                                                                                                                                                                           |

### Écrans et parcours

| #   | Fonctionnalité                                                                                                                                                                                   | Verdict       | Justification                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Fiche copro avec ses 4 sections de suivi                                                                                                                                                         | 🔧            | devient l'**onglet « Contrats »** de la fiche copro de l'intranet (celui qui est aujourd'hui un lien externe). L'en-tête (identité, équipe, dates AG/CS) existe déjà dans l'intranet : on ne le refait pas                                                                                                                                  |
| 12  | 4 listes par sujet + vue directeur                                                                                                                                                               | 🔧 fusionnées | **une seule liste consolidée** des suivis (sujet, copro, échéance, niveau, étape courante), barre de recherche libre + filtres (sujet, niveau, agence, gestionnaire), compteurs `Stat` qui suivent le filtre, vue portefeuille / agence / cabinet déjà offerte par l'intranet. La « vue directeur » n'est qu'une vue cabinet de cette liste |
| 13  | Liste des copropriétés avec badge agrégé et filtres                                                                                                                                              | 🔁            | `/copropriete` existe ; on y ajoute au plus une pastille « contrats » (pire niveau)                                                                                                                                                                                                                                                         |
| 14  | Accueil : cartes rouge / orange / vert / à compléter                                                                                                                                             | 🔁            | un bloc « Échéances de contrats » sur l'accueil de l'intranet, sur le modèle `alerte-mandats-sans-ag` (rendu `null` si rien à faire). Pas de second accueil                                                                                                                                                                                 |
| 15  | « À compléter » (file de qualité par gestionnaire, édition en ligne, choix du collaborateur pour les directeurs)                                                                                 | 🔧            | précieux ; devient un onglet de la liste consolidée. Améliorations : la ligne « immatriculation manquante » s'appuie sur le registre national déjà en base ; la ligne « conseil syndical sans adresse » renvoie à la cascade de destinataires de l'intranet au lieu de relire `intranet_listes_diffusion` à la main                         |
| 16  | « Suivis à démarrer » (copros concernées sans cycle)                                                                                                                                             | ✅             | même onglet                                                                                                                                                                                                                                                                                                                                 |
| 17  | Infos générales : registre national (chauffage, ECS, ventilation, diagnostics, PPT, étiquettes), bâtiments, outil « Compléter les bâtiments » (LGC / HLS)                                        | 🔧            | c'est de la **fiche immeuble**, pas du suivi de contrat, mais **dans le périmètre initial** (décision du 16/10) pour que l'ancienne appli s'éteigne entièrement. 72 bâtiments saisis, 265 fiches métadonnées. Section « Immeuble » de la fiche copro + file « bâtiments à compléter ». Le registre national n'a **pas d'API** : un export de fichier vers le registre est possible plus tard, pas une mise à jour en direct. eStale porte ces notions (`Building`, descriptif) et sera la cible |
| 18  | Infos générales : champs « métier courant » (dates AG/CS, durée AG, nb CS, Pennylane, facturation courante, frais postaux, panier BPO, nom du SDC…)                                              | ❌             | l'intranet en est déjà propriétaire (ADR-023, facturation, récap AG). Deux écrans d'édition pour une même colonne = la source des incohérences actuelles                                                                                                                                                                                    |
| 19  | Mail au conseil syndical : comparatif gaz, comparatif assurance, devis CTQ unique / comparatif, prévisualisation, signature Signitic, envoi « au nom du » gestionnaire, trace « déjà envoyé le » | 🔧            | le besoin est bon (8 envois réels). Réécrit sur le port mail de l'intranet, les 6 modèles migrent dans `intranet_mail_modeles` (variables `{{…}}` + un marqueur `{{offres}}` rendu en tableau), les destinataires viennent de la cascade CS de l'intranet, la trace « envoyé le » va dans le journal du cycle                               |
| 20  | Documents (dépôt < 4 Mo dans `{dossier copro}/Contrats/{module}` de SharePoint, pointeurs en base, suppression logique, téléchargement)                                                          | 🔧            | réutiliser le port de dépôt de l'intranet, l'étendre (créer le sous-dossier, supprimer, lien de téléchargement) ; garder la table de pointeurs `Document` (l'intranet n'en a pas)                                                                                                                                                           |
| 21  | Aide / notice                                                                                                                                                                                    | 🔁            | fiche process sur l'extranet, comme tout gros sujet mis en prod (règle du 14/10)                                                                                                                                                                                                                                                            |

### Administration et plomberie

| #   | Fonctionnalité                                                                                                 | Verdict | Justification                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | Auth SSO, auto-provisioning au rôle AUTRE, re-check `isActive`, tables `Session` / `MagicLinkToken`            | ❌       | l'intranet a son SSO et son module Collaborateurs (24 utilisateurs sont restés en AUTRE faute d'admin)                                                                                                          |
| 23  | Périmètre de lecture par rôle + modèle C d'écriture + test miroir                                              | 🔁      | ADR-041 : lecture cabinet, écriture par `coproAppartient` (portefeuille, rôle, délégations). Voir arbitrage §9.3                                                                                                |
| 24  | Admin utilisateurs                                                                                             | ❌       | `/collaborateurs`                                                                                                                                                                                               |
| 25  | Admin carnet de contacts (ascensoristes, fournisseurs gaz, courtiers partenaires, contact principal par copro) | 🔧      | fusion avec le référentiel d'entreprises du cabinet (celui des clés, qui a déjà `estale_supplier_id`). Voir §9.4                                                                                                |
| 26  | Admin seuils de relance (`ReminderRule`)                                                                       | 🔧      | jamais modifiés depuis le seed, mais Sekou veut garder la main (16/10) : la table reste, un écran `/admin/relances` sur le modèle de `/admin/tarifs`, réservé à la direction                                     |
| 27  | Admin modèles d'e-mail                                                                                         | 🔁      | `/admin/modeles-mail`                                                                                                                                                                                           |
| 28  | Admin journal d'audit (filtres, facettes)                                                                      | 🔧      | journal par copro dans l'onglet Contrats (composant `ui/journal`) pour les gestes faits dans l'intranet ; l'historique de l'ancienne appli reste en archive SQL (16/10)                                         |
| 29  | Notifications in-app (cloche)                                                                                  | ❌       | 0 notification en prod ; l'intranet signale par l'accueil et par mail                                                                                                                                           |
| 30  | Cron `run-reminders` (mail binôme, copie directeur si rouge, cadence 7 jours)                                  | 🔧      | un cron « échéances de contrats » sur le patron `rappel-comptes-cs` + `intranet_rappels_envoyes`, **après** nettoyage des dates aberrantes. Voir §9.8                                                           |
| 31  | Cron `check-overdue`                                                                                           | ❌       | lié au point 8                                                                                                                                                                                                  |
| 32  | Importateurs SharePoint / Excel, générateurs de gabarits, scripts d'audit et d'export                          | ❌       | amorçage terminé, données en base ; les scripts restent dans le dépôt source pour mémoire                                                                                                                       |
| 33  | Colonne `searchNormalized`, `alertLevel` stocké, `lastReminderSentAt`                                          | ❌       | 260 copros se filtrent en mémoire (c'est ce que fait l'intranet) ; le niveau se calcule à la volée (l'app source ne lit déjà plus `alertLevel`) ; l'idempotence des rappels vit dans `intranet_rappels_envoyes` |
| 34  | 27 routes API « un PATCH par champ »                                                                           | ❌       | actions serveur zod (`actionGestionnaire`) comme partout dans l'intranet                                                                                                                                        |
| 35  | API REST interne (`/api/coproprietes`, `/api/suivis/...`)                                                      | ❌       | si une exposition machine est voulue, c'est `/api/v1` + MCP (ADR-033)                                                                                                                                           |

---

## 4. Défauts repérés dans l'application source, et comment on les traite

| Défaut                                                                                      | Constat                                                                                                                                                        | Traitement                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Deux ORM sur une même table**                                                             | l'intranet écrit des rôles que l'enum Prisma ne connaît pas → 500 côté source (06/10)                                                                          | un seul propriétaire des tables : l'intranet. Plus de Prisma sur cette base à la décommission                                                                                                                            |
| **Dates d'amorçage aberrantes**                                                             | 16 CTQ ascenseur et 3 VMC avec échéance avant 2024 (1906, 1930, 2017), 58 CTQ échus, 9 assurances et 6 CTQ sans échéance                                       | passe de nettoyage **avant** tout rappel automatique : liste nominative aux gestionnaires via « À compléter », pas de mail tant qu'elle n'est pas vidée                                                                  |
| **Crons jamais armés**                                                                      | rappels, escalades, notifications : tout le dispositif d'alerte est théorique ; les 97 « rouges » du premier passage sont pour partie des artefacts d'amorçage | le niveau se montre d'abord à l'écran (liste, accueil), le mail vient ensuite, par sujet, avec validation du patron                                                                                                      |
| **Niveau stocké périmé**                                                                    | `alertLevel` n'est mis à jour que par le cron (jamais passé) ; l'app l'a contourné en recalculant à la volée                                                   | la colonne meurt, le calcul pur fait foi                                                                                                                                                                                 |
| **Couplage SQL brut à `intranet_listes_diffusion`**                                         | regex sur `designation`, repli silencieux si la table manque                                                                                                   | service de destinataires de l'intranet                                                                                                                                                                                   |
| **Recopie offre → copro**                                                                   | l'héritage est une copie, d'où l'interdiction d'éditer une offre élue (D13)                                                                                    | règle conservée mais rendue visible : le cycle garde `selectedOfferId`, la fiche affiche « contrat courant hérité de l'offre du … »                                                                                      |
| **Suppression dure des offres et devis**                                                    | l'audit est la seule trace                                                                                                                                     | journal immuable du cycle, suppression logique (`deletedAt`) comme pour les documents                                                                                                                                    |
| **`mutations.ts` 4 288 lignes, 7 fonctions `setXxx` quasi identiques, une route par champ** | coût de maintenance, barrières de sécurité répétées 40 fois à la main                                                                                          | une action serveur par geste métier, périmètre vérifié par `exigerPerimetre`, règles dans le domaine                                                                                                                     |
| **Périmètre d'écriture divergent**                                                          | directeurs écrivent par chaîne `referentDirector` côté source ; par rôle + délégations côté intranet                                                           | un seul modèle, celui d'ADR-041 (arbitrage §9.3)                                                                                                                                                                         |
| **Résolution du dossier SharePoint fragile**                                                | tronque `sharepointUrl` de son dernier segment, « à sonder » depuis la spec                                                                                    | l'intranet dépose déjà sous `sharepointUrl` (contrat de syndic, pièces jointes) : même convention, on réutilise ; le bug « `Ascenseurs/CTQ` passé comme un seul nom » du 07/10 disparaît avec `ensureFolder` par segment |
| **`Copropriete.insuranceDueDate` vide pour 178 copros**                                     | l'intranet affiche « Assurance jusqu'au … » en conformité et l'ODJ du CS (REA-251) la lit : pour une copro chez un courtier partenaire il n'y a rien           | la conformité doit dire « suivie par le courtier X » plutôt que « ko » (règle à écrire dans le domaine)                                                                                                                  |
| **14 copros déclarent des ascenseurs sans appareil créé**                                   | aucun CTQ suivable                                                                                                                                             | ligne « à compléter » : créer les appareils                                                                                                                                                                              |
| **Régime UTC vs Paris**                                                                     | règles de date pensées en UTC (cron) avec un cas limite 0 h - 2 h                                                                                              | dates civiles en `date` Postgres, comparaison au jour de Paris, comme le reste de l'intranet                                                                                                                             |
| **24 utilisateurs en rôle AUTRE**                                                           | auto-provisioning sans admin derrière                                                                                                                          | disparaît avec l'auth source ; les rôles vivent dans Collaborateurs                                                                                                                                                      |
| **`db:guard` ne voit pas les `CREATE`**                                                     | un `migrate dev` a failli recréer des tables intranet                                                                                                          | plus de Prisma = plus de ce risque ; d'ici là, pas de migration côté source                                                                                                                                              |

---

## 5. Modèle de données cible

Principe : **le référentiel reste là où il est**, les tables de suivi sont **adoptées telles quelles** (option recommandée, voir §9.5), ce qui double l'existant est **fusionné**, ce qui ne sert pas est **abandonné à la décommission**.

### 5.1 On garde (tables de l'application source, lues par un adapter supabase-js de l'intranet)

| Table                                                                  | Rôle                                                                                                                                                                                                | Remarque                                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Copropriete`                                                          | référentiel + **contrat courant** (assureur, n° de contrat, courtier, souscription, échéance ; fournisseur gaz, type de prix, montant, échéance ; société et réf. VMC, dernier CTQ VMC ; compteurs) | déjà partagée ; le port copro de l'intranet s'enrichit de ces colonnes                      |
| `Elevator`                                                             | les appareils (identifiant, dernier CTQ)                                                                                                                                                            | nouveau pour l'intranet                                                                     |
| `InsuranceTracking`, `GasContractTracking`, `GasVmcCtq`, `ElevatorCtq` | les cycles, étapes datées, statut, `selectedOfferId`, notes                                                                                                                                         | `alertLevel` et `lastReminderSentAt` ne sont plus lus ; `manuallyStarted` devient un dérivé |
| `InsuranceOffer`, `GasOffer`, `CtqQuote`                               | offres et devis                                                                                                                                                                                     | + `deletedAt` (suppression logique)                                                         |
| `Document`                                                             | pointeurs SharePoint (drive, item, type, module, rattachement exclusif, suppression logique)                                                                                                        | l'intranet n'a pas d'équivalent                                                             |
| `BuildingMetadata`, `Building`                                         | fiche immeuble (registre national)                                                                                                                                                                  | conservées, section « Immeuble » de la fiche copro (§3.17)                                  |
| `ReminderRule`                                                         | les 5 seuils de relance                                                                                                                                                                             | conservée, administrée depuis `/admin/relances` (§3.26)                                     |
| `AuditLog`                                                             | 2 697 lignes d'historique                                                                                                                                                                           | **archive** : plus jamais écrite, consultable en SQL, pas d'écran                           |

### 5.2 On fusionne

| Source                                   | Cible intranet                                                                                                                                                                                                                                                                                           | Comment                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Contact` (37) + `BuildingContact` (152) | référentiel d'entreprises du cabinet (aujourd'hui `intranet_cles_entreprise`), étendu d'un champ « métiers » (ascensoriste, fournisseur gaz, courtier, assureur…) et d'un drapeau « courtier partenaire » ; chaque ligne reliée quand c'est possible à un fournisseur eStale (`estale_supplier_id`) ; table de liaison `intranet_copro_prestataire (copro_code, entreprise_id, metier, principal)` | reprise par script, rapprochement par nom normalisé ; les entreprises présentes d'un seul côté (intranet ou eStale) remontent dans « À compléter » ; le jour où tout est dans eStale, la table n'est plus qu'un cache (décision du 16/10) |
| `EmailTemplate` (6)                      | `intranet_mail_modeles`                                                                                                                                                                                                                                                                                  | 6 lignes insérées, variables renommées dans le vocabulaire de l'intranet, marqueur `{{offres}}` ajouté au moteur de fusion |

### 5.3 On crée

| Table                        | Rôle                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intranet_contrats_journal`  | journal immuable des gestes (étape datée, cycle clos, offre créée / retenue / retirée, document, mail envoyé), trigger anti-UPDATE/DELETE comme `intranet_cles_mouvement` |
| `intranet_copro_prestataire` | liaison copro ↔ entreprise par métier (reprend `BuildingContact`)                                                                                                         |
| (`intranet_rappels_envoyes`) | existe déjà : clé « contrats / sujet / cycle / semaine » pour l'idempotence des rappels                                                                                   |

### 5.4 On abandonne à la décommission de l'application source

`Session`, `MagicLinkToken`, `Notification` (vide), `EmailTemplate` (après recopie), `Contact` / `BuildingContact` (après fusion), `CtqRemediationItem` (vide), `_prisma_migrations`, colonnes `searchNormalized`, `alertLevel`, `lastReminderSentAt`, et les colonnes « métier courant » éditées à double (elles restent lues par l'intranet, elles cessent d'être éditées ailleurs).

### 5.5 Et eStale ?

eStale modélise déjà les contrats fournisseurs (`SupplierContract`, catégories assurance MRI, gaz, maintenance ascenseur, VMC), le carnet de l'ascenseur avec son contrôle quinquennal, les bâtiments et l'immatriculation. Pour 10 copros ESTALE sur 271 aujourd'hui, ce n'est pas la source V1. Mais le port est conçu avec une **source explicite par donnée** (règle ADR-022) : le « contrat courant » et les « appareils » pourront basculer sur eStale copro par copro, les **cycles de suivi** (étapes, offres, niveau) restant natifs à l'intranet, puisque eStale ne les porte pas.

---

## 6. Plan d'intégration

### 6.1 Place dans le produit

- **Barre latérale, groupe Syndic** : une entrée **« Contrats & contrôles »** (tranché le 16/10), à côté de « Contrats de syndic », à la place du lien externe « Contrats copro ». Route `/contrats-copro`.
- **Fiche copro** : l'onglet « Contrats » devient interne. Il porte les 4 sections de suivi, les documents, le bouton mail au CS, le journal. Une section **« Immeuble »** (registre national, bâtiments, compteurs) rejoint la vue d'ensemble.
- **Admin** : `/admin/relances` (seuils par sujet) à côté de `/admin/tarifs` et `/admin/modeles-mail`.
- **Accueil** : un bloc « Échéances de contrats » (rouges, oranges, à compléter sur mon périmètre), même patron que les mandats sans AG.
- **Liste consolidée** `/contrats-copro` : onglets « Suivis » (barre de recherche + filtres + `Stat`) et « À compléter ».
- **Conformité** de la vue d'ensemble : les lignes « Assurance » et « CTQ » existantes s'enrichissent (courtier partenaire, prochain CTQ ascenseur).

### 6.2 Zones de code (archi hexagonale, règle ESLint `boundaries`)

```
src/lib/domain/contrats-copro/        règles pures : sujets, étapes, qualification (fenêtre, 30/60 j),
                                      cycle (clôture, re-clôture), offres (héritage), pré-conditions
                                      d'équipement, « à compléter », constantes de relance
src/lib/ports/contrats-copro-repository.ts   lecture/écriture des cycles, offres, devis, appareils, pointeurs
src/lib/adapters/supabase/supabase-contrats-copro-repository.ts  (+ mock)
src/lib/services/contrats-copro/      lister-suivis, fiche-contrats, dater-etape, cloturer-cycle,
                                      offres, devis, documents (via DepotDocumentProvider étendu),
                                      mail-cs (via MailOutboundProvider + modèles + destinataires),
                                      a-completer, rappels (cron)
src/app/contrats-copro/{page,actions}.ts
src/app/api/cron/echeances-contrats/route.ts
src/components/contrats-copro/        liste, onglet fiche, sections par sujet, modales, bloc accueil
supabase/sql/intranet_contrats_journal.sql, intranet_copro_prestataire.sql, seed modèles de mail
```

### 6.3 Réutilisé tel quel

`AppShell`, `Page`, `Section`, `Stat`, `Table`, `Badge`, `Modal`, `Field`, `Tabs`, `useConfirm`, `useToast`, `ui/journal` · `getGestionnaireCourant`, `actionGestionnaire`, `exigerPerimetre` / `coproAppartient`, vue portefeuille / agence / cabinet · `MailOutboundProvider`, `intranet_mail_modeles`, `destinataires-conseil`, signature · `DepotDocumentProvider` · `intranet_rappels_envoyes` · registre national · référentiel d'entreprises · `revalidatePath` + `Res`.

### 6.4 À créer

Domaine, port, adapter (+ mock pour les tests), services, les trois surfaces UI, le cron, deux tables SQL, l'extension du port de dépôt (créer un sous-dossier, supprimer, URL), l'extension du moteur de modèles (`{{offres}}`), les tests (domaine pur en priorité : qualification, cycle, héritage d'offre, pré-conditions).

### 6.5 Étapes livrables proposées (chacune testable, un point à chaque fois)

1. **Lire** : onglet Contrats de la fiche copro (4 suivis, étapes, échéance, niveau, offres, documents en lecture) + liste consolidée + bloc accueil. Aucune écriture. Les deux applis coexistent sans conflit.
2. **Suivre** : dater / dé-dater une étape, démarrer, clôturer (cycle suivant), action groupée ascenseurs, corriger le contrat courant et les compteurs. Journal. **À partir d'ici l'ancienne appli passe en lecture seule** (bascule franche, §9) : Emmanuel et l'équipe sont prévenus avant.
3. **Offres, devis, documents** : saisie, suppression logique, validation = clôture, dépôt SharePoint.
4. **Mail au CS** : modèles migrés dans `/admin/modeles-mail`, prévisualisation, **envoi direct** depuis la boîte du gestionnaire avec un avertissement avant départ, test sur SE999 d'abord.
5. **À compléter + rappels** : file par gestionnaire, nettoyage des dates aberrantes, écran `/admin/relances`, puis cron d'échéances armé sujet par sujet avec le feu vert de Sekou.
6. **Immeuble** : section registre national + bâtiments dans la fiche copro, file « bâtiments à compléter », entreprises fusionnées dans le référentiel du cabinet.
7. **Extinction** : l'ancienne appli s'éteint ; suppression des tables mortes ; fiche process sur l'extranet.

Entre 1 et 2, l'application source reste pleinement utilisable : même base, mêmes tables, pas de double saisie à organiser. À partir de 2, un seul moteur écrit les cycles.

---

## 7. Reprise des données

Pas de migration de masse : les données restent dans leurs tables. Ce qu'il y a à faire :

| Action                                                                    | Volume                                   | Quand                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Fusionner `Contact` / `BuildingContact` dans le référentiel d'entreprises | 37 entreprises, 152 liens                | étape 6 (script `scripts/`, à blanc puis réel)        |
| Rapprocher les entreprises des fournisseurs eStale                        | à mesurer                                | étape 6, manques listés dans « À compléter »          |
| Recopier les 6 modèles de mail                                            | 6                                        | étape 4                                               |
| Nettoyer les échéances aberrantes et manquantes                           | 19 dates < 2024, 19 cycles sans échéance | étape 5, par les gestionnaires via « À compléter »    |
| Créer les appareils manquants                                             | 14 copros                                | étape 5                                               |
| Statuer sur les 11 copros INACTIVE et leurs cycles                        | 11                                       | étape 1 (filtre ACTIVE, comme le reste de l'intranet) |
| Garder les copros de test SE999 / T999                                    | 2                                        | décision existante du patron                          |
| Geler `AuditLog`                                                          | 2 697 lignes                             | étape 6                                               |
| Supprimer les tables mortes                                               | 6 tables                                 | après extinction de la source                         |

---

## 8. Critère de réussite, relu

« Un utilisateur ne doit pas pouvoir deviner que ce module vient d'une autre application » se vérifie ainsi : même barre latérale, même fiche copro, mêmes composants, même périmètre d'écriture que le reste, mêmes modèles de mail administrés au même endroit, même façon de signaler ce qui est à faire (accueil), même journal, même fiche process. Et une seule application écrit dans `Copropriete`.

---

## 9. Décisions (Sekou, 16/10/2026)

| # | Question | Décision | Conséquence dans le plan |
|---|---|---|---|
| 1 | Nom du module | **« Contrats & contrôles »** | barre latérale, onglet de la fiche copro, route `/contrats-copro` |
| 2 | Mode de bascule | **Bascule franche, écran par écran** : l'ancienne appli passe en lecture seule dès que l'intranet écrit les étapes (étape 2) | prévenir Emmanuel et l'équipe avant l'étape 2 ; un seul moteur écrit les cycles |
| 3 | Droits d'écriture | **ADR-041** (portefeuille, rôle, délégations, porte unique `coproAppartient`) | le modèle C des directeurs n'est pas reconstruit ; le directeur syndic écrit par rôle et délégations, plus par chaîne de référent |
| 4 | Référentiel d'entreprises | **Référentiel du cabinet relié à eStale** : les 37 contacts rejoignent le référentiel des clés généralisé, chaque ligne reliée quand c'est possible à un fournisseur eStale | les écarts entre intranet et eStale remontent dans « À compléter » ; à terme la table n'est qu'un cache d'eStale, qui aura tous les ascensoristes |
| 5 | Tables | **Gardées telles quelles**, lues et écrites par un adapter de l'intranet | zéro migration ; renommage éventuel après extinction de l'ancienne appli |
| 6 | Remédiation post-CTQ | **Abandon en V1** | ni écran, ni cron `check-overdue` ; le patron des cycles l'accueillera si le terrain le demande |
| 7 | Fiche immeuble (registre national, bâtiments) | **Dans le périmètre initial** (étape 6, avant l'extinction) | section « Immeuble » de la fiche copro + file « bâtiments à compléter ». Le registre national n'a pas d'API : un export de fichier est envisageable plus tard, pas une mise à jour en direct ; vérifier si ESTALE déclare déjà pour ses copros |
| 8 | Rappels par mail | **Écran d'abord, mail à l'étape 5** : niveau visible dès l'étape 1 (accueil, liste) ; le mail hebdomadaire (binôme, directeur en copie si rouge) part après nettoyage des dates aberrantes, sujet par sujet, avec feu vert de Sekou | analyse des 97 « rouges » du premier passage avant tout envoi |
| 9 | Mail au conseil syndical | **Envoi direct avec prévisualisation**, un avertissement avant départ, test sur SE999 avant ouverture | garde-fou ADR-047 appliqué (pilotes, envoi activé) ; la trace « envoyé le » va dans le journal |
| 10 | Seuils de relance | **Écran d'administration conservé** | la table `ReminderRule` reste, écran `/admin/relances` réservé à la direction |
| 11 | Champs « métier courant » | **L'intranet en est l'unique propriétaire** | ils sortent du module ; vérifier au passage que chacun a un écran dans l'intranet |
| 12 | Historique `AuditLog` | **Archive seulement** | la table reste en base, plus jamais écrite, pas d'écran ; le journal de l'intranet commence à la bascule |
