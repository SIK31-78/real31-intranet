# Gestion des clés — audit de l'existant et conception V2 (real31.app)

> Audit et conception validés par Sekou le 18/09/2026 (4 arbitrages : entreprise autonome, Storage dès l'import, pas d'accès externe, trousseau + composition). ADR-040 dans `DECISIONS.md`, SQL dans `supabase/sql/intranet_cles.sql`.
> Sources : `Mythec-refactor/Gestion des clés/` (msapp décompilé + 5 exports SharePoint), `SPK_1.txt` (démo Keiko), base Supabase (lecture seule), repo real31-intranet.

## Contexte

Dernier outil MYTHEC (PowerApps) à porter. Les 6 automatisations sont faites ; « Gestion des clés » est une **application canvas** (pas un flow), donc un vrai module à concevoir. Objectif : un outil de comptoir rapide, fiable, traçable, et non une copie de PowerApps.

---

## 1. Compréhension de l'existant (audit)

### 1.1 Architecture actuelle

- **Canvas app PowerApps « Gestion des Clés »** (format téléphone, 10 écrans, 1 composant Menu), connectée à **5 listes SharePoint** du site `real31france.sharepoint.com/sites/ITDarkwood`. Aucun flow Power Automate, aucune dépendance avec les 6 automatisations MYTHEC déjà portées. Aucune notification, aucun cron.
- Écrans : Dashboard (3 tuiles compteurs) · Liste des clés (recherche) · Détail d'une clé (fiche + accès + 3 boutons) · Détail accès d'une clé · Réserver · Emprunter · Remettre · Réservations (journal) · Sociétés · Détail d'une société.
- Toute la logique est dans les formules des écrans (`Patch`, `SubmitForm`). Pas de règle serveur.

### 1.2 Modèle de données actuel (listes SharePoint)

| Liste | Colonnes | Rôle réel |
|---|---|---|
| **Keys** (167) | Title = numéro (R001…, J001…), Photo, Status {Disponible, Réservé, Emprunté}, Tiroir (T001…) | Le **trousseau** (pas la clé unitaire). Aucun contenu détaillé. |
| **Buildings** (153) | Title = **référence copro Crypto** (S001…), Adresse 1-3, Ville | Malgré le nom, c'est la **copropriété** : 138/139 références distinctes matchent `Copropriete.referenceCrypto` en base. |
| **AccessTypes** (181) | Title (libellé libre « Accès total »…), Key (lookup), Building (lookup), AccessType (multi-choix : Total, Local eau, Local fibre, Local vélo, Local encombrants, Parking, Chaufferie, Local électrique, Toiture, Caves, Jardin) | **Table de jonction trousseau ↔ copro** + nature de l'accès. C'est elle qui porte le « à quoi sert ce trousseau ». |
| **Companies** (2 036) | Title, Tél, MailBox, Adresse 1-3, CP, Ville, Note | Annuaire fournisseurs (import massif Crypto probable : **188 seulement utilisées**, 1 831 jamais). |
| **Reservations** (2 391) | Key ID (lookup), Collaborator ID (lookup vers une liste non exportée, 23 noms), Company ID (lookup), Reservation Date (**date seule, saisie manuelle**), Status {Réservé, Emprunté, Restitué} | **Journal d'événements** : chaque action crée UNE ligne. Pas de lien entre la réservation, l'emprunt et la restitution d'un même cycle. |

Relations : Keys 1—n AccessTypes n—1 Buildings ; Reservations n—1 Keys / Companies / Collaborateurs. Pas de notion d'immeuble physique, pas de clé unitaire, pas de date d'échéance, pas d'heure, pas de commentaire, pas d'annulation.

### 1.3 Fonctionnement métier actuel (reconstruit depuis les formules)

- **Réserver** (bouton actif si trousseau *Disponible*) : crée une ligne Reservations `Réservé` (clé, collaborateur, société, date) + passe le trousseau à `Réservé`.
- **Emprunter** (actif si *Réservé* ou *Disponible*) : crée une ligne `Emprunté` + trousseau → `Emprunté`. Le collaborateur est **choisi dans une liste**, pas déduit de la session. La date est saisie à la main (défaut vide).
- **Remettre** (actif si *Emprunté*) : crée une ligne `Restitué` (société facultative) + trousseau → `Disponible`. Le message de succès dit « La réservation a été enregistrée » (copier-coller).
- Le statut du trousseau est **écrasé** à chaque action : aucune machine à états contrôlée côté données, une réservation n'est jamais « annulée » (on écrase en Disponible via la fiche, ou on emprunte par-dessus).
- Recherche « Liste des clés » : `AddColumns` + 6 `Substitute` pour désaccentuer, sur **toute la liste chargée côté client** (non délégable, d'où la lenteur). Recherche Sociétés : `in Titre` sur 2 036 lignes.
- Dashboard : 3 `CountRows(Filter(Keys, Status = …))` — pas de retard, pas de « réservations du jour ».
- Aucune trace de *qui* a enregistré (le champ Collaborateur est déclaratif ; `Created By` SharePoint existe mais n'est pas exploité).

### 1.4 Ce que disent les données (2024-01 → 2026-09-17)

- **Usage réel : une seule agence, LGC** (La Garenne-Colombes). 134 des 141 copros actives LGC ont au moins un trousseau ; 0 copro ML ou HLS. Deux séries de numéros : R001-R099 (série initiale, déc. 2024) et J001-J097 (ajouts 2025). 108 tiroirs.
- Volume : **54 à 199 mouvements/mois** (déc. 2024 → sept. 2026 ; les 2 lignes datées de janv./févr. 2024 sont des dates mal saisies, l'outil démarre en déc. 2024), 3 collaboratrices font 65 % des saisies (accueil). 23 saisisseurs distincts.
- **Durée d'un emprunt** (1 033 cycles sortie→retour reconstruits ; les 26 sorties « par-dessus » un trousseau déjà sorti écrasent le prêt précédent et ne sont pas comptées) : médiane **0 jour** (54 % rendus le jour même), p75 = 4 j, p90 = 25 j, 90 cycles > 30 j, 26 > 90 j, max 463 j. → Deux usages très différents : l'intervention à la journée et le chantier long. Une **date de retour prévue** est indispensable pour distinguer retard et prêt long.
- **37 emprunts ouverts** aujourd'hui, dont **9 depuis plus de 240 jours** (J016 depuis janv. 2025 chez GAMAL Bâtiment, R017 juil. 2025, R094 juil. 2025…). Personne ne les voit : l'outil n'a pas de notion de retard.
- **Réservations** : 203 au total, 178 suivies immédiatement d'un emprunt (88 %) ; les 25 autres ne sont pas forcément perdues (emprunt plus tard ou jamais), mais le statut `Réservé` ne bloque rien.
- **Anomalies de journal** : 31 restitutions sans emprunt ouvert, 26 emprunts sur trousseau déjà sorti, 28 mouvements sans trousseau, 321 sans société (dont 310 restitutions : le champ est facultatif), 67 sans collaborateur. 32 lignes dont la date saisie contredit l'ordre du fichier (hypothèse ordre = création, l'ID SharePoint n'est pas exporté : indice, pas preuve). 2 incohérences statut/journal (R017 « Disponible » mais sorti ; R022 « Emprunté » sans emprunt).
- **Société « DIVERS »** = 318 mouvements (13 %) : fourre-tout quand l'entreprise n'est pas dans l'annuaire → perte de traçabilité. « REAL31 - Syndic » = 66 (usage interne : gestionnaire qui part en visite).
- **Trousseaux** : 3 numéros en doublon (R022, R051, « PASS GENERAL »), 3 sans aucun rattachement, 22 jamais mouvementés, 163/167 avec photo (bon point à reprendre). 9 trousseaux ouvrent **plusieurs copros** (ex. R070 = S214+S215+S216 : ensembles immobiliers voisins) ; 30 copros ont **plusieurs trousseaux** (ex. S118 : TGBT, caves, total, local vélo, jardin, parking = 6 trousseaux).
- **Buildings** : 12 refs en doublon (même copro saisie 2 fois avec l'adresse orthographiée autrement), 1 ref hors format (`S105 Secours`), 3 copros inactives encore référencées, S234 CANOPEA a des « immeubles » qui sont en fait des trousseaux (« PASS GENERAL 1 / 2 »). → Confirme que la notion d'**immeuble physique n'existe pas** dans l'outil : elle a été bricolée dans le libellé d'accès (« Accès Médéric », « Accès chateaudrun », « Toiture A », « Local Vélo A »).
- **Companies** : 359 sans tél ni mail, 19 doublons après normalisation (dont ECO SECURITE INCENDIE ×3, L'ESPRIT VERT ×4), 10 mails multi-adresses dans un seul champ.

### 1.5 Problèmes identifiés (synthèse)

1. Pas de retard, pas d'échéance, pas d'alerte → 9 trousseaux « perdus de vue » depuis > 8 mois.
2. Journal non chaîné : impossible de répondre proprement à « qui avait les clés le 12 mars ? » sans reconstruire les séquences (et 57 anomalies rendent la reconstruction ambiguë).
3. Statut écrasable à la main sur la fiche ; aucune règle serveur ; pas d'auteur fiable.
4. Recherche client sur tout le jeu, désaccentuation bricolée, chargement lent.
5. Terminologie : « Remettre » = restituer ; les 3 formulaires se ressemblent et affichent le même message de succès.
6. Annuaire fournisseurs pollué (2 036 dont 188 utiles, « DIVERS »).
7. Immeuble ≠ copro non modélisé ; contenu du trousseau (nombre de clés, badges, bips) non décrit → aucune vérification à la restitution.
8. Mono-agence de fait ; pas de cloisonnement par agence si on généralise.
9. Aucune notification, aucune preuve de remise, aucune photo d'état.

---

## 2. Analyse de `SPK_1.txt` (démo Keiko — solution commerciale, 25-30 €/agence/mois)

### 2.1 Fonctionnalités vues
- Écran **Inventaire** = les armoires/tableaux à clés de l'agence, découpés librement (gestion 1-4, transaction) ; trousseau avec référence, **nombre de clés**, **photo**.
- **Identification automatique des clés sur la photo** (compte les clés/badges), typage des accès (badge, etc.).
- Statuts couleur : vert en agence, orange sorti, + couleur « date limite dépassée ».
- **Prêt = bouton « Confier »** : 3 questions (tout le trousseau ? à qui ? jusqu'à quand ?). Fournisseurs mémorisés, mini-formulaire de création à la volée (société ou nom/prénom + **mail recommandé**).
- Deux niveaux de validation : simple (trousseau déclaré sorti + **attestation générée** avec photo) ou **contrat signé par SMS** (réservé aux trousseaux sensibles ; 95 % des agences restent en simple).
- **Restitution = bouton « Récupérer »** : vérifie que le trousseau est **complet** (comparaison avec la photo/le contenu), puis « Terminer ».
- **Réservation** : bloquer un trousseau pour une période et une personne.
- **Relances automatiques** à l'emprunteur : J+0 20 h, J+2, J+4, puis alerte à l'agence « relancé 3 fois, à vous de jouer ». Durée d'emprunt prolongeable, template mail modifiable.
- Onglet **Emprunts** : prévus / en cours / terminés. Onglet **Biens** : tous les biens gestion/syndic avec leurs trousseaux.
- **Puce NFC** sur le porte-étiquette + lecteur à l'accueil : poser le trousseau ouvre directement sa fiche (formulaire de remise ou de restitution selon l'état).
- Mise en place : un Excel « référence + adresse » suffit, puis photo de chaque trousseau sur place ; formation 30 min.
- Limite avouée : **comptes utilisateurs** — un seul compte partagé « accueil » fréquent, donc on ne sait pas qui a donné les clés (on n'a même pas su, en séance, si Marjolaine était le seul compte).

### 2.2 Pertinent pour nous / à reprendre
Date limite + retard visuel · relances automatiques graduées avec escalade vers l'agence · « Confier / Récupérer » en 3 questions · contrôle de complétude à la restitution · attestation de remise · photo + contenu du trousseau · réservation qui bloque · vue emprunts prévus/en cours/terminés · identification physique (NFC/QR) au comptoir · fiche fournisseur avec mail.

### 2.3 Non adapté / à écarter
- **Comptes partagés** : chez nous chaque collaborateur est authentifié Entra ID ; l'auteur est gratuit et fiable.
- **Signature de contrat par SMS** : coût/complexité pour 5 % des cas ; une attestation PDF horodatée suffit, éventuellement signature au doigt sur tablette plus tard (chantier OneSpan en pause, ne pas mélanger).
- **Inventaire par « armoire »** : notre référentiel est la copro (déjà en base), pas l'armoire. Le tiroir reste un attribut.
- **Volet Biens** (gestion locative) : hors périmètre syndic.
- **Comptage de clés par IA sur photo** : gadget ; un champ « composition » saisi une fois vaut mieux.

### 2.4 Ce que nous pouvons faire mieux
- Auteur réel de chaque mouvement (session Entra), horodatage serveur, journal immuable.
- Référentiel copro **déjà là** (265 copros, adresses, gestionnaire, agence) : zéro ressaisie, recherche par nom/adresse/référence, cloisonnement par agence natif.
- Historique 2 ans repris et **requalifié** (retards a posteriori, anomalies marquées).
- Fiche entreprise enrichie : « détient 3 trousseaux, 1 en retard », taux de retard, contacts multiples.
- Recherche serveur unique (copro / trousseau / entreprise / réservation) plutôt que 3 écrans-listes.
- Retard = règle métier explicite (date de retour prévue, ou durée par défaut si non saisie) plutôt qu'un simple code couleur.

### 2.5 Idées nouvelles suggérées par la démo
QR/NFC au comptoir (voir §6) · relances graduées (voir §7) · attestation PDF (l'app sait déjà produire un PDF serveur) · « prêt interne » distinct du prêt fournisseur (66 mouvements « REAL31 - Syndic ») · alerte « réservé mais non retiré ».

---

## 3. Socle real31.app disponible (ce sur quoi on s'appuie)

| Besoin | Existant réutilisable | Manque |
|---|---|---|
| Entrée de menu | `src/components/layout/sidebar.tsx` : « Gestion des clés » est **déjà un lien PowerApps** dans `APPS_EXTERNES` → à déplacer dans `GROUPES` (« À traiter »). Icône `KeyRound` prise par le Coffre-fort. | — |
| Référentiel copros | `getCoproRepository()` (composite miroir Crypto + eStale live), 265 copros avec `referenceCrypto` = exactement la clé des Buildings SharePoint, agence, gestionnaire, adresse | — |
| Immeubles | eStale `Building { name, address, lots }` par copro (`condo.buildings`), et `Lot.staircase` | Pas de lecture aujourd'hui dans l'app ; à exposer via un port si on veut rattacher un trousseau à un bâtiment eStale |
| Entreprises | eStale `SupplierCondo` / `SupplierEstablishment` / `SupplierContact` (name, email, phone) ; table Prisma `Contact` (37 lignes, ascensoristes/gaz/assureurs) | **Aucune entité entreprise dans le domaine intranet** ; les emprunteurs ne sont pas tous des fournisseurs référencés d'une copro |
| Auth / auteur | Entra ID → `getGestionnaireCourant()` ; rôles par intention (`estDirection`…) ; agence via `agenceDeCopro()` | — |
| Mutations | `actionGestionnaire` + `Refus` + `Res` + zod ; `useToast` / `useConfirm` | — |
| Persistance | `supabase/sql/intranet_*.sql` à la main + `EXECUTES.md` ; RLS off / service_role ; modèle `intranet_perte_dossier.sql` | — |
| Historique | `journal jsonb` (pattern dossiers) ou table immuable (pattern `intranet_historique_contrats`) ; `<Journal>` ; `domain/suivi/etape.ts` (`echeanceDepassee`) | Pas d'audit log générique (ADR-007 non réalisé) |
| Recherche | Palette Ctrl+K : index copros chargé une fois, filtre client (`domain/recherche-copro.ts`) ; combobox débouncée serveur (`useCombobox`) | Pas de fuzzy ; pas de désaccentuation |
| Document | Page imprimable + `window.print()` (ADR-012) ; PDF serveur Chromium si octets nécessaires ; `qrcode` déjà en dépendance | — |
| Mail | `envoyerNeuf()` via Graph, best-effort (`notifier-recap.ts`) | **Aucun cron** (`src/lib/jobs/` vide) → toute relance automatique = premier cron du projet |
| Photos | — | **Aucun stockage de fichiers** (pas de Supabase Storage) → choix d'infra neuf |
| Accès externe | Lien signé 256 bits + code 8 car. + verrou anti-pilonnage (fiche de renseignements reprise) ; clés API `/api/v1` (ADR-033) | Pas de comptes externes |
| UI | Design system `src/components/ui/*` (Table, Rows, Badge, Modal, Stat, Journal, SegmentedControl…), `audit-ui.mjs` bloquant | — |
| Tests | Vitest, tests à côté du code, `pnpm check` | — |

---

## 4. Modèle métier cible

### 4.1 Vocabulaire (proposé, à valider)

| Terme V2 | Définition | Pourquoi |
|---|---|---|
| **Trousseau** | L'objet physique prêté, identifié par un numéro (R012, J045), rangé dans un emplacement (tiroir). C'est l'unité de prêt. | C'est ce que l'outil gère déjà (« Keys » = trousseaux). |
| **Composition** | Liste des éléments du trousseau : clés, badges, bips, télécommandes, pass — type + libellé + quantité. | Permet le contrôle à la restitution sans gérer chaque clé individuellement. |
| **Accès** | Ce que le trousseau ouvre : copro (obligatoire) + immeuble/bâtiment (facultatif) + type(s) d'accès (total, local fibre, chaufferie…). Un trousseau peut avoir plusieurs accès (plusieurs copros ou plusieurs immeubles). | Reprend AccessTypes, en y ajoutant enfin l'immeuble. |
| **Entreprise** | Le tiers à qui l'on confie un trousseau (société, artisan, ou « usage interne »). Peut être liée à un fournisseur eStale. | 188 entreprises actives ; « DIVERS » à bannir. |
| **Contact** | La personne physique qui vient au comptoir (nom, tél, mail), rattachée à une entreprise. | Keiko le fait ; utile pour relancer et pour l'attestation. |
| **Réservation** | Blocage d'un trousseau pour une entreprise sur une période future. N'engage pas la sortie physique. | Séparer réservation et état physique corrige le statut écrasable. |
| **Sortie** (remise) | Le trousseau quitte l'agence. Ouvre un **prêt**. Terme de bouton : **« Sortir »**. | Sans ambiguïté sur le sens (nous → entreprise). |
| **Retour** (restitution) | L'entreprise rend le trousseau, l'agence le reçoit et le contrôle. Ferme le prêt. Bouton : **« Enregistrer le retour »**. | Remplace « Remettre ». |
| **Prêt** | Le cycle sortie → retour d'un trousseau pour une entreprise, avec date de retour prévue. | C'est le chaînon manquant du journal actuel. |
| **Mouvement** | Toute écriture datée : réservation, annulation, sortie, retour, prolongation, déclaration de perte, correction. Journal immuable. | Répond à « qui avait les clés le 12 mars ». |

Terminologie écartée : « Emprunter » (point de vue de l'entreprise), « Remettre » (double sens), « Confier / Récupérer » (Keiko, moins naturel en français d'agence), « Restituer » comme verbe de bouton (c'est l'entreprise qui restitue, pas le collaborateur).

### 4.2 Relations

```
Agence 1—n Trousseau 1—n Accès n—1 Copropriété (référentiel existant)
                                  └── Immeuble (facultatif : nom eStale Building ou libellé libre)
Trousseau 1—n Réservation n—1 Entreprise 1—n Contact
Trousseau 1—n Prêt (au plus UN ouvert) n—1 Entreprise (+ Contact snapshot)
Prêt 0..1—1 Réservation (une réservation convertie)
Trousseau 1—n Mouvement (journal append-only ; référence prêt / réservation)
```

### 4.3 États

**Principe : un seul fait stocké par vérité, tout le reste est dérivé** (c'est le défaut PowerApps — statut écrasable — qu'on ne reconduit pas).

- Stocké sur le trousseau : uniquement une **marque** `null | introuvable | retire` (les deux seuls états qu'aucun prêt ne peut déduire).
- Dérivé (fonction pure du domaine `etatTrousseau(trousseau, pretOuvert, reservations, aujourdhui)`) :
  - `en_agence` — pas de prêt ouvert, pas de marque ; badge **« Réservé »** si une réservation `prevue` commence aujourd'hui ou demain.
  - `sorti` — un prêt ouvert existe ; **`en_retard`** si `retour_prevu_le < aujourd'hui` (`jourParis()`).
  - `introuvable` / `retire` — la marque.
- Réservation stockée : `prevue | convertie | annulee`. **`expiree` est dérivé** (`prevue` et `debut < aujourd'hui`) ; jamais figé en base.
- Prêt : `ouvert` (`rendu_le null`) → `clos` ; attributs de clôture : `retour_conforme` (complet / incomplet / endommagé) + commentaire.
- **La réservation est un souhait indépendant de l'état physique** : on peut réserver un trousseau sorti. Le conflit se règle au moment de la sortie (règle ci-dessous) et le tableau de bord signale « réservation demain sur un trousseau encore sorti ».

Transitions autorisées (service, jamais l'UI) :

| Action | Précondition | Effet |
|---|---|---|
| Réserver | trousseau non `retire` ; pas de réservation `prevue` chevauchante sur la période | Réservation `prevue` + mouvement ; avertissement (non bloquant) si le trousseau est sorti avec retour prévu après le début |
| Sortir | aucun prêt ouvert, pas de marque ; si une réservation `prevue` d'une **autre** entreprise couvre aujourd'hui → refus sauf confirmation explicite (motif) ; entreprise `bloquee` → refus sauf direction | Prêt ouvert (retour prévu obligatoire, défaut aujourd'hui ; **snapshot de la composition** et du contact), réservation de la même entreprise → `convertie`, mouvement |
| Prolonger | prêt ouvert | nouvelle `retour_prevu_le` + mouvement (motif) |
| Enregistrer le retour | prêt ouvert | `rendu_le`, conformité contrôlée **contre le snapshot de composition du prêt**, commentaire (obligatoire si non conforme), mouvement |
| Annuler la réservation | réservation `prevue` | `annulee` + motif + mouvement |
| Déclarer introuvable / retrouvé | pas `retire` ; si un prêt est ouvert il reste ouvert (la perte est chez l'entreprise) | marque + mouvement |
| Retirer | pas de prêt ouvert (direction) | marque `retire` + mouvement |
| Corriger | **direction**, motif obligatoire | on n'édite jamais un mouvement : mouvement `correction` (`corrige_id`, avant/après) + valeur corrigée sur la ligne d'état (prêt/réservation) ; le service revérifie l'unicité du prêt ouvert et l'absence de chevauchement après correction |

**Atomicité** : supabase-js n'offre pas de transaction multi-tables. Deux options — (a) ordre d'écriture fixe et testé (ligne d'état d'abord, mouvement ensuite ; une écriture partielle est détectable par un contrôle « prêt sans mouvement de sortie » dans le tableau de bord direction) = pattern actuel du repo ; (b) fonction Postgres `cles_sortir(...)` / `cles_retour(...)` appelée en RPC = atomique mais pattern nouveau. Recommandation : **(a) en V1**, (b) si un cas d'écriture partielle est observé.

### 4.4 Granularité : décisions métier à prendre (non couvertes par l'existant)

| Question | Constat | Proposition | À trancher |
|---|---|---|---|
| Clé individuelle ou trousseau ? | L'outil ne connaît que le trousseau ; Keiko compte les clés sur photo | **Trousseau + composition déclarée** (type/libellé/quantité). Pas de suivi unitaire des clés. | Sekou |
| Plusieurs exemplaires d'une même clé (doubles) ? | Non modélisé ; « R004 et R005 » sont deux trousseaux identiques pour S008/S009 | Deux trousseaux distincts, avec un champ « jumeau de » facultatif pour les retrouver ensemble | Sekou |
| Rattacher à un immeuble précis ? | Bricolé dans le libellé (« Accès Médéric », « Toiture A ») | Champ `immeuble` sur l'accès : libellé libre en V1, alimenté par la liste eStale `condo.buildings` quand elle existe (suggestion, pas contrainte) | Sekou |
| Changement de composition ? | Impossible aujourd'hui | Éditable sur la fiche, chaque changement = mouvement `composition_modifiee` (avant/après) | — |
| Trousseau commun à plusieurs copros ? | 9 cas réels (ensembles immobiliers) | Plusieurs accès sur un trousseau, chacun avec sa copro. La copro « principale » = celle du premier accès (pour le cloisonnement et la fiche copro). | — |
| Usage interne (gestionnaire en visite) ? | 66 mouvements « REAL31 - Syndic » | Entreprise spéciale « Usage interne REAL31 » avec le collaborateur comme contact ; ou type de prêt `interne`. Recommandation : **type de prêt `interne`** (pas d'entreprise, contact = collaborateur), exclu des stats de retard fournisseur. | Sekou |
| Durée de prêt par défaut ? | 54 % rendus le jour même, p90 = 25 j | Date de retour prévue **obligatoire**, pré-remplie à aujourd'hui ; retard = J+1 après la date prévue. Pas de durée max imposée. | Sekou |
| Copro perdue / inactive ? | 3 copros inactives ont encore des trousseaux | Alerte sur la fiche ; passage en `retire` proposé depuis l'étape TR2 de la checklist de perte (`domain/perte/dossier.ts:67`) | — |

---

## 5. Modèle de données V2 (Supabase, `public.intranet_cles_*`)

Conventions repo : pas de FK vers les tables Prisma (`copropriete_id` = code `S0xx`, `user_id` = `public."User".id`), RLS off / service_role, `create table if not exists` + `add column if not exists`, `comment on table`. Un seul fichier `supabase/sql/intranet_cles.sql`, ligne dans `EXECUTES.md`.

```
intranet_cles_trousseau
  id uuid pk · agence_code text (ML/LGC/HLS/ASN) · numero text · libelle text · emplacement text (tiroir)
  composition jsonb [{type: cle|badge|bip|telecommande|pass|autre, libelle, quantite}]
  photo_chemin text (Storage, nullable) · marque text null check (marque in ('introuvable','retire'))
  marque_depuis timestamptz · jumeau_de uuid · note text
  source text (intranet|import_powerapps) · cree_par text · created_at · updated_at
  unique (agence_code, numero)
  (pas de colonne etat, pas de pret_courant_id : dérivés ; la copro principale = premier accès par `ordre`)

intranet_cles_acces
  id · trousseau_id · copropriete_id text · immeuble text · types text[] · libelle text · ordre int
  index (copropriete_id), (trousseau_id)

intranet_cles_entreprise      (référentiel CABINET, pas cloisonné par agence : une entreprise sert plusieurs agences)
  id · nom · nom_normalise (unique, désaccentué/minuscule) · telephone · email · adresse jsonb
  note · statut text (active|bloquee) · motif_blocage · estale_supplier_id text
  contacts jsonb [{nom, telephone, email, principal}]
  source · cree_par · created_at · updated_at

intranet_cles_reservation
  id · trousseau_id · entreprise_id · contact jsonb (snapshot) · debut date · fin_prevue date
  motif text (intervention) · origine text (interne|externe) · statut check (prevue|convertie|annulee)
  pret_id · annulee_le · annulee_par · motif_annulation · cree_par · created_at
  index (trousseau_id, debut), (statut, debut)

intranet_cles_pret
  id · trousseau_id · type check (entreprise|interne) · entreprise_id · contact jsonb (snapshot)
  composition jsonb (snapshot à la sortie) · reservation_id · motif text
  sorti_le timestamptz · sorti_par_id · sorti_par_nom · retour_prevu_le date
  rendu_le timestamptz · recu_par_id · recu_par_nom · retour_conforme (complet|incomplet|endommage) · commentaire_retour
  photo_retour_chemin · created_at
  check ((type = 'interne') = (entreprise_id is null))
  index partiel unique (trousseau_id) where rendu_le is null   ← un seul prêt ouvert par trousseau
  index (entreprise_id, rendu_le), (retour_prevu_le) where rendu_le is null

intranet_cles_mouvement   (append-only)
  id · trousseau_id · type (creation|modification|composition_modifiee|reservation|annulation_reservation|
        sortie|prolongation|retour|introuvable|retrouve|retrait|correction|relance|import)
  horodatage timestamptz default now() (serveur) · par_user_id · par_nom · agence_code
  entreprise_id · pret_id · reservation_id · corrige_id · details jsonb (avant/après, motif, conformité, incohérence d'import)
  index (trousseau_id, horodatage desc), (entreprise_id, horodatage desc), (horodatage desc)
  + trigger `before update or delete … raise exception` (create or replace, idempotent)
```

Choix structurants et justification :
- **Prêt = ligne d'état + mouvements = journal** (pattern `intranet_historique_contrats`, pas `journal jsonb`) : « qui a les clés » = `pret where rendu_le is null` ; « qui avait les clés à telle date » = `sorti_le <= d and (rendu_le is null or rendu_le > d)`.
- **Immuabilité garantie en base, pas seulement par l'application** : `service_role` contourne tout `revoke`, donc un **trigger** interdit `update`/`delete` sur `mouvement`. Pattern nouveau dans le repo → documenté dans l'ADR-040. L'adapter n'implémente que `ajouter` et `lister`.
- **Entreprise = table intranet autonome, liée à eStale par `estale_supplier_id` facultatif** (arbitré par Sekou le 18/09) plutôt que lecture directe de `SupplierCondo` : (1) `SupplierCondo` est par copro alors que l'emprunteur est transverse (ABSOLU SERVICES intervient sur 40 copros) ; (2) l'emprunteur n'est pas toujours un fournisseur contractuel ; (3) le comptoir doit créer une entreprise en 10 s sans dépendre d'eStale. **Dérogation à ADR-022 à écrire noir sur blanc dans l'ADR-040.** Enrichissement eStale (contacts, contrats) = phase avancée.
- **Snapshots** (`contact`, `composition` sur le prêt) : l'attestation, le contrôle au retour et l'historique ne changent pas quand la fiche entreprise ou la composition sont modifiées ensuite.
- **`agence_code` sur le trousseau** : cloisonnement par agence natif ; LGC seule au départ, ML/HLS/ASN démarrent sans migration. L'entreprise, elle, est cabinet.
- **Photos** : Supabase Storage ouvert dès l'import (arbitré par Sekou le 18/09) : bucket privé `cles`, chemin `trousseaux/<id>.jpg` et `retours/<pretId>.jpg`, URLs signées courtes servies par le serveur ; SDK confiné à `src/lib/adapters/supabase/` (boundaries). Nouvelle brique d'infra → ADR-040.
- **RLS** : s'aligner sur le dernier pattern du repo (`enable row level security` sans policy = `service_role` seul), et le dire dans l'ADR ; `add column if not exists` présents dès la v1 du fichier SQL (avertissement `EXECUTES.md`).

---

## 6. Parcours utilisateurs V2

Principe : **une seule page « Clés »** avec recherche en tête, un panneau d'action contextuel, et des fiches. Pas de navigation Liste → Détail → Formulaire → Détail comme en PowerApps.

### 6.1 « Une entreprise arrive à l'agence » (comptoir, objectif < 15 s, 3 clics)
1. `/cles` : champ de recherche focus par défaut. Taper « nordmann » ou « R004 » ou « absolu » → résultats mêlés (trousseaux avec état, copros, entreprises, réservations du jour).
2. Si une **réservation du jour** correspond (bandeau « Aujourd'hui : ABSOLU SERVICES vient chercher R004 ») → un clic **« Sortir »** pré-rempli (entreprise, contact, motif, date de retour = fin prévue).
3. Sinon, sur le trousseau : **« Sortir »** → modale à 3 champs : entreprise (combobox, création à la volée « + Nouvelle entreprise » avec nom + tél/mail), contact (facultatif, mémorisé par entreprise), **retour prévu le** (défaut aujourd'hui) + motif facultatif. Valider.
4. Toast « R004 sorti — ABSOLU SERVICES, retour prévu le 18/09 » + lien « Imprimer l'attestation ».
Auteur, horodatage, agence : automatiques.

### 6.2 « Où sont les clés de cette copro ? »
Recherche « bleuets » → carte copro S004 avec **tous ses trousseaux** et leur état en une ligne chacun : « R002 · Accès total · **Sorti** chez CTH depuis 3 j (retour prévu demain) · Julie B. » / « J045 · Local fibre · En agence, tiroir T041 ». Même bloc affiché sur la **fiche copropriété** existante (onglet ou section « Trousseaux »), et lien depuis l'étape TR2 de la perte de copro.

### 6.3 « Une entreprise appelle pour demain »
Trousseau → **« Réserver »** : entreprise, contact, date (défaut demain), fin prévue, motif. Le service vérifie l'état (sorti avec retour prévu après demain → « Sorti chez X, retour prévu le 25 : réserver quand même ? ») et les chevauchements. Confirmation mail à l'entreprise si un mail existe (best-effort). La réservation apparaît dans « Réservations à venir » et sur le trousseau.

### 6.4 « Qui détient actuellement les clés ? »
`/cles` sans recherche = tableau de bord : **Sortis** (trié par ancienneté, retard en rouge), **Réservations du jour / à venir**, **Mouvements récents**. Fiche entreprise : « détient 3 trousseaux, 1 en retard ».

### 6.5 « L'entreprise rend les clés »
Recherche → trousseau `sorti` → **« Enregistrer le retour »** : conformité (complet par défaut / incomplet / endommagé → commentaire obligatoire, photo facultative), reçu par = session. Le prêt se clôt, durée affichée. Si l'entreprise avait d'autres trousseaux sortis, la modale les liste (« CTH a aussi R017 sorti depuis 437 j — le rendre aussi ? »).

### 6.5 bis Gestes secondaires (depuis la fiche trousseau, menu « ⋯ »)
- **Prolonger** : nouvelle date de retour + motif ; visible sur la ligne « Sorti » et dans le journal.
- **Annuler la réservation** : motif obligatoire ; mail d'annulation à l'entreprise si un mail existe.
- **Déclarer introuvable** : commentaire ; le trousseau sort des compteurs « en agence » ; si un prêt est ouvert, il reste ouvert et l'entreprise apparaît comme responsable. « Retrouvé » = geste inverse.
- **Retirer** (direction) : trousseau archivé, historique conservé, proposé depuis l'étape TR2 d'une perte de copro.
- **Corriger** (direction) : sur un mouvement du journal, formulaire avant/après + motif.

### 6.6 Fiches
- **Trousseau** : en-tête (numéro, état, emplacement, copro(s), photo), composition, accès, **frise** (Réservé → Sorti → Retour) du cycle courant, **Journal** complet (`<Journal>`), actions contextuelles (une seule primaire).
- **Entreprise** : coordonnées, contacts, statut (bloquée + motif), trousseaux détenus, retards, historique des prêts et réservations, taux de retard, bouton « Nouveau prêt ».
- **Journal global** (`/cles/journal`) : paginé serveur, filtres période / entreprise / collaborateur / type, export CSV.

### 6.7 Recherche
- Volumes réels : ~170 trousseaux, ~200 entreprises, ~140 copros, 2 400 mouvements (+1 500/an). **L'index trousseaux+copros+entreprises (< 50 Ko) se charge une fois par page et se filtre côté client** avec désaccentuation et tolérance (préfixes de mots, numéro sans zéros : « r4 » → R004) — même pattern que la palette Ctrl+K, réponse instantanée au comptoir. Ce n'est pas un gros volume : la recherche serveur y serait plus lente qu'utile.
- **Journal et historiques = serveur, paginés** (index Postgres ci-dessus).
- Intégration à la **palette Ctrl+K** : les trousseaux y apparaissent (« R004 — Sorti chez CTH »).

### 6.8 UI
Design system existant : `Page largeur="travail"`, `PageHeader`, `Section`, `Table`/`Rows`, `Badge` (ok = en agence, info = réservé, warn = sorti, err = en retard, neutral = introuvable/retiré), `Modal` pour les 3 actions, `Stat` pour les compteurs, `Journal`, `FriseEtapes`. Comptoir sur tablette : cibles 36 px, formulaire vertical, un seul primaire. `audit-ui.mjs` avant chaque commit.

---

## 7. Fonctionnalités : conserver / améliorer / nouvelles

### 7.1 À conserver (existant qui marche)
Numérotation R/J et tiroirs · photo du trousseau · notion d'accès typé par copro · les 3 gestes réserver / sortir / retour · tuiles de compteurs · annuaire d'entreprises · journal chronologique.

### 7.2 À améliorer

| Existant | Proposition | Justification | Impact technique | Impact métier |
|---|---|---|---|---|
| Statut écrasable, 3 valeurs | Machine à états côté service, réservation séparée de l'état physique | 57 anomalies, R017/R022 incohérents | Domaine pur + tests | Fiabilité du « où est-il ? » |
| Journal non chaîné, date seule saisie | Prêt (sortie↔retour) + mouvements horodatés serveur | Impossible de mesurer durées/retards proprement | 2 tables | Retards visibles, durée réelle |
| Collaborateur choisi dans une liste | Auteur = session Entra | 67 mouvements sans auteur | Gratuit | Traçabilité opposable |
| « Remettre » | « Sortir » / « Enregistrer le retour » | Ambiguïté | Libellés | Zéro erreur de sens |
| Recherche client lente, désaccentuation bricolée | Index léger + normalisation partagée, palette Ctrl+K | Lenteur PowerApps | `domain/cles/recherche.ts` | Comptoir instantané |
| « Immeuble » = copro, libellé libre | Copro du référentiel + immeuble facultatif | 12 doublons, S105 Secours | Lien `referenceCrypto` | Zéro ressaisie d'adresse |
| Companies 2 036 lignes, DIVERS | 188 utiles importées, DIVERS interdit, création à la volée en 10 s, doublons fusionnés | 13 % des mouvements non identifiés | Import + `nom_normalise` unique | Chaque prêt a un vrai responsable |
| Dashboard 3 compteurs | Sortis / en retard / réservations du jour / mouvements récents ; alerte sur `/accueil` pour le gestionnaire de la copro | 9 trousseaux perdus de vue | Services de lecture | Retards traités |
| Formulaire retour sans contrôle | Conformité + commentaire + photo | Aucune vérification aujourd'hui | Colonnes | Litiges tranchés |

### 7.3 Nouvelles fonctionnalités (classées)

**Indispensable (V1)**
- Date de retour prévue + retard dérivé + tri par ancienneté.
- Prêt interne (gestionnaire en visite) distinct du prêt fournisseur.
- Composition du trousseau (types/quantités) et contrôle au retour.
- Fiche entreprise : « détient N, M en retard », historique.
- Journal immuable + correction tracée (direction).
- Bloc « Trousseaux » sur la fiche copropriété + lien depuis TR2 (perte de copro).
- Création d'entreprise à la volée depuis la modale de sortie.
- Attestation de remise imprimable (page `/cles/prets/[id]/attestation`, `window.print()`), avec composition et signature manuscrite au comptoir si souhaité.

**Utile (V1.1 – V2)**
- Alertes sur `/accueil` : « 3 trousseaux de vos copros en retard », « réservation non retirée hier ».
- Mails best-effort à l'entreprise : confirmation de réservation, rappel J-1, relance retard (graduée J+1 / J+7 / J+15 puis escalade au gestionnaire) — nécessite le **premier cron** du projet (Vercel Cron quotidien 8 h, `src/app/api/cron/cles-relances`).
- Prolongation d'un prêt (motif).
- Blocage d'une entreprise (motif) : la sortie refuse sauf direction.
- Étiquette QR par trousseau (`qrcode` déjà présent) : scanner avec la caméra de la tablette ouvre la fiche avec la bonne action (le pendant du NFC Keiko, sans matériel).
- Export CSV du journal ; statistiques (durée moyenne, taux de retard par entreprise, trousseaux les plus mouvementés).
- Photo de retour en cas d'anomalie (nécessite Storage).

**À envisager (V3, après retour terrain)**
- Portail entreprise en lien signé (§9).
- Inventaire physique périodique : mode « pointage » tiroir par tiroir, écarts théorique/réel = mouvements `inventaire`.
- Calendrier des réservations par trousseau (grille existante `vue-semaine.tsx`).
- Liste d'attente sur un trousseau sorti.
- Rattachement aux bâtiments eStale (`condo.buildings`) et aux contrats fournisseurs (`SupplierContract.buildingID`) pour proposer l'entreprise « habituelle » d'une copro.

**Potentiellement inutile / complexe**
- Comptage de clés par IA sur photo ; signature de contrat par SMS ; lecteurs NFC ; comptes utilisateurs entreprise avec mot de passe ; gestion de créneaux horaires fins (l'agence a des horaires d'ouverture, pas des créneaux) ; suivi unitaire de chaque clé.

---

## 8. Traçabilité et audit

- **Chaque mouvement est une ligne `intranet_cles_mouvement` écrite par le service**, horodatée serveur, avec `par_user_id` + `par_nom` (session), jamais modifiée. Le service n'expose ni update ni delete ; l'adapter n'implémente que `ajouter` et `lister`.
- **Correction** : une action « Corriger » (direction, motif obligatoire) crée un mouvement `correction` avec `corrige_id`, `avant`, `apres`, et applique la nouvelle valeur sur la ligne d'état (prêt). Le journal montre les deux.
- Réponses aux 3 questions : « Où est-il ? » = `trousseau.etat` + prêt ouvert ; « Qui l'a pris, pourquoi, depuis quand ? » = prêt ouvert (entreprise, contact, motif, sorti_le, sorti_par) ; « Qui avait les clés le 12/03 ? » = requête d'intervalle sur `pret`.
- **Conservation** : illimitée (volumes faibles : ~1 500 lignes/an). Les mouvements importés de PowerApps portent `type = import` + `details.incoherence` quand la séquence était ambiguë.
- Sentry via `signalerException` pour toute erreur technique ; pas d'audit générique (ADR-007) : le module a le sien.

---

## 9. Sécurité, droits, accès entreprise

### 9.1 Interne
- **Agence de session** = `Gestionnaire.agencyId` (domaine existant, FK `public."Agency"`), traduite en code par `AgenceRepository` ; collaborateur sans agence → lecture seule de tout, écriture refusée (cas à signaler à la direction). Pas de cloisonnement par gestionnaire : le comptoir sert toutes les copros de l'agence.
- Rôles existants réutilisés (`src/lib/auth/roles.ts`) via des intentions nouvelles : `peutOperererCles(profil, agence)`, `peutAdministrerCles(profil)` (= `estDirection`).

| Action | Collaborateur de l'agence | Autre agence | Direction |
|---|---|---|---|
| Voir trousseaux, prêts, réservations, journal | ✅ son agence | lecture seule | ✅ tout |
| Réserver / sortir / retour / prolonger / annuler | ✅ | ❌ | ✅ |
| Créer / modifier un trousseau, ses accès, sa composition | ✅ | ❌ | ✅ |
| Créer / modifier une entreprise (référentiel cabinet) | ✅ | ✅ | ✅ |
| Déclarer introuvable / retrouvé | ✅ | ❌ | ✅ |
| Sortir vers une entreprise bloquée | ❌ | ❌ | ✅ (motif) |
| Bloquer / débloquer une entreprise, retirer un trousseau, corriger un mouvement | ❌ | ❌ | ✅ (motif) |
| Exposer en lecture via `/api/v1` / MCP (ADR-033) | — | — | plus tard, **lecture seule**, jamais d'écriture |

- Gardes en service (`Refus`), pas en UI ; tests d'actions avec session mockée (pattern `perte-copro/actions.test.ts`).

### 9.2 Accès externe : recommandation = **pas en V1**, et jamais par comptes

| Option | Avantages | Risques | Coût |
|---|---|---|---|
| **A. Aucun accès externe** (V1) | Zéro surface ; le comptoir reste maître | Appels téléphoniques pour réserver (situation actuelle) | 0 |
| **B. Mails sortants seulement** (confirmation, rappel, relance) | 80 % de la valeur (l'entreprise sait quand rendre) sans exposer de données | Mails non lus | Faible (Graph existant) + cron |
| **C. Lien signé par prêt/réservation** (pattern fiche de renseignements : token 256 bits + code, expiration, verrou) : l'entreprise consulte SA réservation, demande une prolongation, signale un retard, ou **confirme un créneau proposé** | Pas de compte, pas de mot de passe, révocable par expiration, anti-énumération déjà écrit | Diffusion du lien ; à limiter à des actions sans effet direct (demandes validées par un collaborateur) | Moyen |
| **D. Portail entreprise avec comptes** (recherche de site, trousseaux disponibles, réservation autonome) | Autonomie | Expose la liste des copros et des accès d'un immeuble à des tiers (information sensible : « local TGBT », « toiture »), gestion d'utilisateurs par entreprise, révocation, abus de réservation, support | Élevé ; hors périmètre d'un intranet ; contraire à la posture « collaborateur au centre » |

**Arbitré par Sekou le 18/09 : A en V1, B ensuite.** C reste une option V3 (réservation = *demande* validée par un collaborateur, l'entreprise ne voit jamais la liste des trousseaux d'un site, seulement les siens). **D écarté** : le bénéfice (quelques appels évités) ne couvre pas le risque de divulgation des accès des immeubles.

---

## 10. Notifications (celles qui économisent un geste)

| Notification | Destinataire | Déclencheur | Valeur | Prérequis |
|---|---|---|---|---|
| Confirmation de réservation (date, instructions de retrait, horaires agence) | Entreprise (contact) | Création | Évite le rappel téléphonique | Mail Graph (existe) |
| Rappel de retour J-1 / jour J | Entreprise | Cron quotidien | Réduit les retards courts | **Cron à créer** |
| Relance retard J+1, J+7, J+15 | Entreprise, copie collaborateur à J+15 | Cron | Les 9 trousseaux > 8 mois n'existeraient pas | Cron |
| Réservation non retirée (J+1) | Collaborateur qui a réservé | Cron ou affichage | Libère le trousseau | Affichage suffit en V1 |
| Alerte accueil « retards sur vos copros » | Gestionnaire | Affichage `/accueil` | Zéro infra | Existe (pattern alerte récaps) |

Écartées : notification à chaque création/annulation vers les collaborateurs (bruit), SMS (coût, pas d'adapter).

Règles de mise en œuvre :
- Logique dans `src/lib/jobs/cles-relances.ts` (fonction pure appelable par le cron **et** en CLI `pnpm tsx scripts/cles-relances.mts --dry-run`), la route `/api/cron/cles-relances` n'est qu'un déclencheur protégé par `CRON_SECRET` (ADR-004).
- Best-effort : un mail qui ne part pas ne défait jamais l'écriture ; chaque envoi = mouvement `relance` (destinataire, niveau) ; pas de second envoi du même niveau.
- Sans adresse mail sur le contact ni l'entreprise : pas d'envoi, la relance passe directement au collaborateur (mouvement `relance` avec `details.sans_mail = true`), et la fiche entreprise affiche « pas de mail ».
- Contenu (texte brut + HTML aux couleurs intranet, modèle `notifier-recap-html.ts`) : confirmation = trousseau, copro/adresse, date, horaires et adresse de l'agence, « à restituer le … » ; rappel/relance = même bloc + « retour prévu le … », niveau, coordonnées de l'agence ; expéditeur = boîte de l'agence (paramètre env), réponse vers le collaborateur.
- Opt-out : un champ `relances` (oui/non) sur l'entreprise, à la main de l'agence.

---

## 11. Migration des données (SharePoint → Supabase)

Script `scripts/import-cles-powerapps.mjs` (idempotent, dry-run par défaut, rapport d'écarts), sur le modèle `import-recap-ag-historique.mjs`.

| Source | Cible | Règles | Problèmes à traiter |
|---|---|---|---|
| Keys (167) | trousseau | `agence_code = LGC`, `numero = Title`, `emplacement = Tiroir`, aucun état stocké (dérivé des prêts reconstruits ; contrôle : le `Status` SharePoint doit coïncider, sinon rapport), photo → Storage, `source = import_powerapps` | 3 doublons (R022 ×2, R051 ×2, PASS GENERAL ×2) → à arbitrer manuellement avant import ; 3 sans accès (J097, S185, PASS GENERAL) ; S185 mal nommé |
| Buildings (153) | — (référentiel copro existant) | `Title` → `referenceCrypto` (138/139 OK) | `S105 Secours` → S105 + accès « secours » ; S0305 (nouvelle copro eStale) → vérifier la ref ; doublons d'adresse ignorés ; S234 « PASS GENERAL 1/2 » = trousseaux, pas immeubles |
| AccessTypes (181) | acces | `types` = AccessType, `libelle` = Title normalisé, immeuble = extrait du libellé si évident (« Toiture A », « Accès Médéric ») | 7 lignes sans clé ou sans immeuble → rapport, non importées |
| Companies (2 036) | entreprise | **188 utilisées** importées ; `nom_normalise`, fusion des 19 doublons ; mails multiples → contacts ; « DIVERS » → entreprise `Non identifiée (historique)` bloquée ; « REAL31 - Syndic » → prêts `interne` | 1 848 lignes non importées (option : garder un CSV « annuaire Crypto » pour la création à la volée) |
| Reservations (2 391) | reservation + pret + mouvement | Reconstruction par trousseau, ordre = date puis ID SharePoint : `Réservé` → réservation (`convertie` si emprunt suit, sinon `expiree`) ; `Emprunté` → prêt ouvert ; `Restitué` → clôture du prêt ouvert ; `retour_prevu_le` = `sorti_le` (inconnu) ; heure = 12:00 Paris ; auteur = mapping des 23 noms vers `public."User"` (à vérifier, sinon `par_nom` seul) | 31 retours sans prêt → mouvement `import` avec incohérence ; 26 sorties sur trousseau déjà sorti → clôture implicite du précédent avec `incoherence` ; 28 sans trousseau → rapport ; 321 sans société → `Non identifiée` ; 37 prêts restent ouverts (à faire pointer physiquement par LGC avant bascule : c'est l'inventaire de démarrage) |
| Photos (163) | Storage | Le CSV ne contient que le nom de fichier : **export des pièces jointes SharePoint via Graph** (`/sites/ITDarkwood/lists/{id}/items/{id}/attachments`) puis upload | Nécessite Supabase Storage + droits Graph sur le site ; sinon V1 sans photo |

Stratégie : import en **deux passes** (référentiel puis historique), gel de PowerApps le jour J (lecture seule), rapport d'import validé par LGC, **pointage physique des 37 trousseaux sortis** avant l'ouverture.

---

## 12. Plan de migration technique (incréments)

| Inc. | Contenu | Livrable vérifiable | Effort (ordre de grandeur) | Valeur |
|---|---|---|---|---|
| **0 — Cadrage** | ADR-040 « Module Gestion des clés » (entreprise autonome = dérogation ADR-022, prêt + journal immuable par trigger, agence, Storage, RLS) ; `supabase/sql/intranet_cles.sql` (+ bucket `cles`) ; ROADMAP | ADR relu par Sekou ; SQL passé et **vérifié en base** | ½ j | Prérequis |
| **1 — Domaine + référentiel** | `src/lib/domain/cles/` (types, `etatTrousseau`, transitions, retard, recherche normalisée, composition) + tests ; ports `cles-repository`, `cles-entreprise-repository`, `cles-photo-store` ; adapters Supabase (+ Storage) + mock ; `router.ts` ; script d'import **référentiel + photos** (export SharePoint via Graph) ; pages `/cles` (liste + recherche), `/cles/trousseaux/[id]`, `/cles/entreprises`, `/cles/entreprises/[id]` ; menu (remplace le lien PowerApps, `aVenir` tant que non ouvert) | 167 trousseaux, 163 photos et 188 entreprises visibles ; recherche « nordmann » → R004/R005 | 3-4 j | Voir enfin l'état réel |
| **2 — Comptoir** | Services `reserver`, `sortir`, `enregistrerRetour`, `prolonger`, `annulerReservation`, `declarerIntrouvable`, `corriger` + tests ; actions ; 3 modales + menu « ⋯ » ; journal du trousseau ; import de l'historique (prêts/mouvements) ; bloc trousseaux sur la fiche copro (une requête de plus sur une page déjà chargée, budget +30 ms) et dans la palette Ctrl+K (index étendu, +10 Ko) | Scénario comptoir en < 15 s en E2E navigateur ; historique déc. 2024-2026 relu par LGC | 3-4 j | Le cœur : remplace PowerApps |
| **3 — Pilotage** | Tableau de bord `/cles` (sortis, retards, réservations du jour, récents, « réservation demain sur trousseau sorti ») ; alerte `/accueil` ; fiche entreprise « détient N » ; attestation imprimable ; blocage entreprise ; contrôle « prêt sans mouvement » (direction) | Bascule LGC : PowerApps en lecture seule | 2 j | Retards traités, bascule |
| **4 — Automatisations** | Premier cron (`src/lib/jobs/cles-relances.ts` + route + CLI) ; mails confirmation/rappel/relance ; QR étiquettes ; photo de retour ; export CSV ; stats | Relances envoyées et tracées en mouvement `relance` | 2-3 j | Moins d'appels, moins de pertes |
| **5 — Option** | Lien signé entreprise (demandes) ; inventaire physique ; calendrier ; port + adapter eStale `condo.buildings` pour l'immeuble | Sur retour terrain | à chiffrer | Selon usage |

Total V1 (inc. 0-3) : **~9-11 jours** de développement, hors validation LGC et import réel. Tout le domaine reste sous `pnpm check` (typecheck, lint boundaries, tests, build hors machine de Sekou : pas de `next build` local).

Chaque incrément = branche `chantier/cles-*`, commits atomiques, `pnpm check`, ROADMAP + note Journal Obsidian.

---

## 13. Plan de tests

- **Domaine (Vitest)** : machine à états (chaque transition autorisée/refusée), retard (`retour_prevu_le` vs `jourParis()`), chevauchement de réservations, normalisation de recherche (« r4 », « nordman », « absolu »), reconstruction des cycles d'import sur un jeu synthétique reproduisant les 4 anomalies réelles.
- **Services** : ordre des écritures (prêt puis mouvement), unicité du prêt ouvert (index partiel : test d'intégration smoke sur base de test), snapshots contact, dégradation si table absente.
- **Actions / permissions** : session mockée : collaborateur LGC ne voit pas ML ; correction refusée hors direction ; entreprise bloquée refusée ; zod sur toutes les entrées.
- **E2E navigateur** (session principale, données confinées à un trousseau de test `SE999`) : parcours comptoir, retour incomplet, réservation puis sortie pré-remplie, attestation imprimable.
- **Performance** : budget page `/cles` < 400 ms serveur (1 requête trousseaux + 1 prêts ouverts + 1 réservations du jour, `Promise.all`) ; journal paginé 50 lignes ; index vérifiés `explain`.
- **Sécurité** : aucun accès sans session ; agence forcée côté serveur pour toute écriture ; URLs de photos signées et courtes ; cron protégé par secret ; trigger d'immuabilité testé (un `update` sur `mouvement` doit échouer).
- **Import** : dry-run = rapport d'écarts ; totaux de contrôle (167 / 181 / 188 / 1 033 cycles + 37 ouverts) ; rejouable.

---

## 14. Déploiement et transition

1. Inc. 1-2 en prod derrière l'entrée de menu `aVenir` (visible direction seulement via allowlist) ; PowerApps reste l'outil vivant.
2. Import du référentiel + historique un vendredi soir ; LGC pointe les 37 trousseaux sortis lundi matin.
3. Bascule : PowerApps passé en lecture seule (retirer les droits d'écriture SharePoint), entrée de menu ouverte à LGC, formation 30 min au comptoir.
4. Deux semaines de double lecture (l'ancien reste consultable), puis retrait du lien PowerApps.
5. Ouverture ML/HLS/ASN quand elles le demandent : création de leurs trousseaux directement dans l'intranet (pas d'import).

---

## 15. Risques et points à arbitrer

| # | Point | Options | Décision / recommandation |
|---|---|---|---|
| 1 | **Entreprise : table intranet autonome vs fournisseur eStale** | (a) autonome + lien facultatif ; (b) `SupplierCondo` en direct | **(a) — tranché par Sekou le 18/09** ; dérogation ADR-022 à documenter |
| 2 | **Photos → Supabase Storage** (infra neuve) | (a) V1 sans photo ; (b) Storage dès l'import | **(b) — tranché par Sekou le 18/09** ; reste à vérifier que l'export des pièces jointes SharePoint via Graph est possible avec les droits actuels (sinon repli : photos reprises à la main au pointage physique) |
| 3 | **Périmètre agence** | LGC seule / multi-agence | Multi-agence par conception, LGC seule à l'usage |
| 4 | **Durée par défaut et définition du retard** | J+0 / J+1 / paramétrable | Retour prévu obligatoire, défaut aujourd'hui, retard dès le lendemain |
| 5 | **Prêt interne** | entreprise fictive / type `interne` | Type `interne` |
| 6 | **Cron** (premier du projet) | Vercel Cron / calcul à l'affichage seul | Affichage en V1 ; Vercel Cron en Inc. 4 |
| 7 | **Accès externe** | A/B/C/D (§9.2) | **A puis B — tranché par Sekou le 18/09** ; C plus tard ; D écarté |
| 7b | **Granularité** | trousseau + composition / clé unitaire | **Trousseau + composition — tranché par Sekou le 18/09** |
| 7c | **Atomicité prêt + mouvement** | ordre d'écriture testé / fonction RPC Postgres | Ordre d'écriture en V1 (pattern repo), RPC si écriture partielle observée |
| 8 | **Droits de correction** | direction seule / tout collaborateur avec motif | Direction seule |
| 9 | **Mapping des 23 saisisseurs vers `public."User"`** | par nom (à vérifier) / `par_nom` seul | Tenter le mapping, garder `par_nom` |
| 10 | **Les 37 prêts ouverts dont 9 > 8 mois** | importer tels quels / clôturer « inconnu » | Importer ouverts + pointage physique LGC = inventaire de départ |
| 11 | Trousseaux multi-copros et cloisonnement | copro principale / toutes | Agence, pas copro : le problème disparaît |
| 12 | Composition inconnue pour les 167 existants | saisie progressive au premier retour | Champ facultatif, invitation à compléter |

---

## 16. Ce que nous reprenons de la solution commerciale (Keiko)

| Fonctionnalité | Fonctionnement chez Keiko | Existe dans MYTHEC ? | Reprise ? | Adaptation real31.app | Difficultés |
|---|---|---|---|---|---|
| Date limite + code couleur retard | Saisie au prêt, couleur dédiée | Non | **Oui** | `retour_prevu_le` + badge `err` + tri | Aucune |
| Relances automatiques graduées + escalade agence | J+0/J+2/J+4 puis alerte agence | Non | **Oui** (Inc. 4) | Cron quotidien + `envoyerNeuf` + mouvement `relance` | Premier cron du projet |
| « Confier » en 3 questions | tout le trousseau ? à qui ? jusqu'à quand ? | Partiel (4 champs, collaborateur manuel) | **Oui** | Modale « Sortir » : entreprise / contact / retour prévu | Aucune |
| Création fournisseur à la volée, mail recommandé | Mini-formulaire | Non (écran séparé) | **Oui** | « + Nouvelle entreprise » dans la combobox | Doublons → `nom_normalise` |
| Contrôle de complétude au retour | Comparaison photo / liste | Non | **Oui** | Composition + conformité + commentaire | Composition à saisir progressivement |
| Attestation de remise générée | PDF avec photo | Non | **Oui** | Page imprimable (ADR-012) | Photo = Storage |
| Réservation bloquante | Période + personne | Partiel (statut écrasé) | **Oui** | Entité réservation + chevauchement | Aucune |
| Emprunts prévus / en cours / terminés | Onglet | Partiel (journal brut) | **Oui** | Tableau de bord + journal filtré | Aucune |
| NFC + lecteur au comptoir | Puce sur porte-étiquette | Non | **Adapté** | QR imprimé + caméra tablette → fiche + bonne action | Étiquettes à coller |
| Inventaire = armoires | Découpage libre | Non (tiroir texte) | Partiel | `emplacement` texte, filtre par tiroir | — |
| Contrat signé par SMS | Option pour trousseaux sensibles | Non | **Non** | Signature manuscrite sur l'attestation ; OneSpan plus tard si besoin | Coût |
| Identification des clés par IA | Photo → liste | Non | **Non** | Composition déclarée | — |
| Volet Biens (locatif) | — | Non | **Non** | Hors périmètre | — |
| Comptes utilisateurs | Souvent un compte partagé | N/A | **Non** (on fait mieux) | Entra ID | — |

## 17. Ce que nous faisons mieux
- Auteur et horodatage réels, journal immuable avec corrections tracées.
- Référentiel copro déjà en base : recherche par nom/adresse/référence, agence, gestionnaire, fiche copro enrichie, lien avec la perte de copro (TR2).
- Historique de 2 ans repris et requalifié (retards a posteriori, 37 prêts ouverts identifiés).
- Prêt interne distinct, entreprise « DIVERS » éradiquée.
- Fiche entreprise avec détention courante, retards et taux, blocage motivé.
- Multi-agence et cloisonnement natifs ; zéro abonnement.
- Alertes intégrées à l'accueil du gestionnaire, pas dans un outil à part.

---

## 18. Questions métier ouvertes (à poser à LGC / Sekou avant Inc. 1)
1. Qui utilise l'outil au comptoir (accueil seule ? gestionnaires ?) et sur quel appareil (PC, tablette) ?
2. Que signifient les préfixes R et J ? (deux armoires ? deux vagues de création ?) Faut-il garder deux séries ?
3. Existe-t-il des trousseaux « sensibles » (pass général, TGBT) qui justifieraient une validation direction avant sortie ?
4. Un trousseau sorti par une entreprise peut-il être transféré directement à une autre sans repasser par l'agence ? (aujourd'hui : non modélisé)
5. Faut-il gérer les clés remises aux **copropriétaires / conseil syndical** (pas seulement aux entreprises) ?
6. Les 9 trousseaux sortis depuis plus de 8 mois : perdus, chantiers longs, ou oublis de saisie ? (détermine la règle de retard et la valeur des relances)
7. Les photos actuelles sont-elles utiles au quotidien (identification visuelle) ou décoratives ?

---

## 18 bis. Première action concrète si le plan est validé
Incrément 0 : rédiger l'ADR-040 dans `DECISIONS.md` (avec les 4 arbitrages du 18/09 et les 3 nouveautés de pattern : trigger d'immuabilité, Storage, dérogation ADR-022), écrire `supabase/sql/intranet_cles.sql`, ajouter la section « Gestion des clés » au `ROADMAP.md` et une note `Journal/2026-09-18 - Gestion des clés, audit et conception.md` dans le vault (à committer côté vault par Sekou). Branche `chantier/cles`.

## 19. Vérification de l'audit lui-même
- Chiffres issus de `analyse_csv.py` / `analyse2.py` (scratchpad) sur les 5 exports SharePoint du 18/09/2026 ; croisement copros via `check_refs*.{mjs,py}` sur `public."Copropriete"` (lecture seule, 265 copros).
- Formules reconstruites depuis `Gestion des Clés.msapp` décompilé (`Src/*.pa.yaml`).
- Aucune modification du repo ni de la base pendant cet audit.
