# Brief de correction — session E2E du 2026-07-28

> Document de travail : Sekou pilote le navigateur sur **prod `real31.app`** et signale les
> défauts, Claude qualifie la cause dans le code et consigne ici. En fin de session, un agent
> dédié exécute cette liste. **Chaque entrée doit être actionnable** : où, pourquoi, quoi faire.

## Règles pour l'agent de correction

- Archi hexagonale (ADR-001) : toute logique de calcul va dans `src/lib/domain/**` (pur,
  testé), jamais dans un composant. La règle ESLint `boundaries` est là pour ça.
- Dates : comparaisons lexicographiques sur `'YYYY-MM-DD'` (jamais `new Date(...)` pour
  comparer — décalage de fuseau à minuit). Pour l'**arithmétique** de dates, passer par
  `Date.UTC` et reformater en `YYYY-MM-DD` : pas de dérive de fuseau.
- Un correctif = **un commit atomique** en français, ton humain, qui explique le POURQUOI.
- Vérifications obligatoires avant de rendre la main : `pnpm exec tsc --noEmit` (0 erreur),
  `pnpm test` (tous verts), `pnpm lint` (0 erreur).
- **Ne pas push** (ni `origin`, ni `deploy`) : la validation avant push appartient à Sekou.
- Ne jamais faire `rm -rf .next` ni tuer un process node : le serveur dev de Sekou tourne.

---

## 1. Le toggle « Moi / Tout » des dossiers ment sur son périmètre

**Gravité** : gênant (libellé faux — l'utilisateur croit voir tout le cabinet).
**Où** : `src/components/affaires/affaires-en-cours.tsx` (lignes ~45-52 et ~92-105), bloc
« Vos dossiers en cours » de `/accueil`.

**Constaté** : « Moi » et « Tout » affichent tous les deux `0 dossier`. Le bouton paraît mort.

**Cause réelle** (analysée le 28/07) — deux choses distinctes, ne pas les confondre :

1. Le `0` est **CORRECT**. Les 14 dossiers de `intranet_dossiers` sont tous `ouvert`, mais
   répartis sur `S219 (3)`, `S072 (7)`, `S058 (2)`, `S117 (1)`, `S204 (1)` — aucune copro du
   portefeuille eStale de Sekou. Le cloisonnement fait son travail. **Rien à corriger ici.**
2. Le **libellé** est faux. Le toggle est un filtre **purement client** appliqué sur un jeu
   déjà cloisonné côté serveur (`getAffairesEnCours(g.id)` → `getDossiers(managerId)` →
   `listerCoprosParRequete(managerId)`). Il ne peut donc que **rétrécir**, jamais élargir.
   Sa seule action réelle : « Moi » retire les dossiers dont l'**étape courante** est
   assignée à `assistant`. Donc « Tout » = *mes dossiers + ceux en main de mon assistant*,
   sur **mes** copros — pas « tout le cabinet ».

**Décision de Sekou : option A — on corrige le mot, pas le périmètre.**

**À faire** :
- Renommer le toggle `Moi` / **`Mon équipe`** (au lieu de `Tout`).
- Mettre à jour le commentaire d'en-tête ligne ~45-48 qui parle de « tout le périmètre » :
  c'est cette phrase qui a induit le libellé en erreur.
- Le compteur `N dossier(s)` à côté reste inchangé.
- Ne PAS toucher au service ni ajouter de requête : le périmètre serveur est correct et
  volontairement cloisonné.

**Non retenu (pour mémoire)** : option B = rendre « Tout » vrai en chargeant les dossiers hors
portefeuille pour les directeurs/super-admins. Écartée pour l'instant : ouvre une vue
transverse sur les copros des collègues + une requête supplémentaire sur l'accueil.

---

## 2. Alerte de délai court à la pose d'une date de prochaine AG

**Gravité** : manque fonctionnel (demande de Sekou, 28/07).
**Où** : `src/components/fiche-copro/editeur-date.tsx` (l'éditeur inline de date, ancre
`#dates-ag` de la fiche copro) + nouveau module de domaine.

**Le besoin, dit par Sekou** : « quand on réserve une date dans prochaine AG on doit pouvoir
avoir une alerte si l'AG est dans moins de 6 semaines, car délai short pour faire CS +
convocation ».

**Le raisonnement métier** : une AG ne se pose pas seule, elle traîne deux jalons derrière
elle. La convocation doit partir **21 jours** au moins avant l'AG (délai réglementaire de
convocation). Et avant de convoquer, il faut avoir tenu le **CS** pour arrêter l'ODJ, puis
avoir le temps de produire et poster la convocation. D'où les ~6 semaines de confort.

> ⚠️ **À confirmer par Sekou avant codage** : les 21 jours (réglementaire) et surtout le
> délai CS → convocation (proposé ici à 14 jours) doivent refléter la pratique du cabinet.
> Ces deux nombres sont les seules constantes du module : les isoler en haut du fichier,
> nommées et commentées, pour qu'elles soient ajustables sans relire la logique.

### Le parti pris d'affichage : un rétroplanning, pas juste une alerte

Une alerte seule (« attention, c'est court ») angoisse sans aider. On affiche donc les
**dates dérivées**, ce qui transforme l'avertissement en outil : le gestionnaire voit
immédiatement ses deux échéances réelles.

Sous le champ date, dès qu'une date est saisie (avant même de valider) :

```
⚠ AG dans 4 semaines — délai court
  Convocation à poster avant le mardi 18 août
  CS à tenir avant le mardi 4 août
```

**Trois niveaux** (aucun ne bloque — le bouton « Valider » reste actif, on avertit) :

| Écart AG − aujourd'hui | Niveau | Message |
|---|---|---|
| ≥ 6 semaines | aucun | rien ne s'affiche |
| 3 à 6 semaines | orange (avertissement) | « AG dans N semaines — délai court » + les 2 jalons |
| < 21 jours | rouge (alerte) | « AG dans N jours — le délai de convocation de 21 jours ne peut plus être tenu » + les 2 jalons (dates déjà dépassées, à signaler comme telles) |
| date passée | — | l'avertissement existant `avertissementDateReunion` prend la main, ne pas le doubler |

### Implémentation

- **Nouveau module pur** : `src/lib/domain/retroplanning-ag.ts` + `retroplanning-ag.test.ts`.
  Une fonction du type :
  ```ts
  retroplanningAg(dateAgISO: string, todayISO: string): {
    niveau: "ok" | "court" | "critique";
    joursAvant: number;
    semainesAvant: number;
    convocationAvantISO: string;   // AG − 21 j
    csAvantISO: string;            // AG − 21 j − 14 j
  } | null                          // null si date invalide ou passée
  ```
  Cas de test à couvrir : pile 6 semaines (frontière → `ok`), 6 semaines − 1 jour (`court`),
  pile 21 jours (frontière), 20 jours (`critique`), date passée (`null`), date malformée
  (`null`), et un passage de mois / d'année dans le calcul des jalons (pas de dérive).
- **Branchement UI** : dans `editeur-date.tsx`, au même endroit que le message de
  `avertissementDateReunion` (même emplacement visuel, même style d'avertissement doux) —
  **ne pas créer un second canal d'alerte**. Réutiliser le ton/les classes existants.
- **Conditions d'affichage** : uniquement `type === "ag"` **et** `quand === "prochaine"`.
  Rien sur le CS, rien sur les dates « dernière » (tenue).
- Le calcul se fait sur la **saisie en cours** (`dateVal`), pas sur la valeur enregistrée :
  le gestionnaire doit voir l'impact avant de valider.
- `todayISO` : attention à l'hydratation. Le composant est déjà `"use client"` ; suivre le
  motif déjà employé ailleurs dans le projet pour l'initialisation client-only de la date du
  jour (il existe un précédent avec un `eslint-disable` justifié pour
  `react-hooks/set-state-in-effect`) plutôt que d'en inventer un nouveau.

**Optionnel, à ne faire que si c'est propre** : une pastille discrète « dans 4 sem. » à côté
de la date sur la fiche, hors édition, quand le niveau est `court` ou `critique`. À proposer
à Sekou plutôt qu'à décider seul.

---

## 3. ✅ RÉSOLU — Date d'AG posée → rien dans l'agenda (ni le mien, ni celui de la salle)

**Signalé par Sekou** le 28/07 sur prod. **Corrigé le jour même** (commit `2999750` + SQL
rejoué par Sekou, projection vérifiée fonctionnelle à l'écran).

### La cause réelle : deux colonnes absentes de la base

`intranet_confirmations_evenement` existait **sans** `outlook_event_id` ni `outlook_boite`
(vérifié : `42703` sur le SELECT de l'adapter, `PGRST204` sur l'UPDATE). La table avait été
créée AVANT que ces colonnes n'entrent dans le fichier SQL, et **`create table if not exists`
ne rattrape jamais une colonne ajoutée après coup** : rejouer le fichier ne faisait rien.

L'enchaînement est le plus vicieux possible — **deux filets corrects se combinent en une
fonctionnalité qui ne peut jamais marcher, en silence total** :

1. `lireEnCascade` retombe sur un jeu de colonnes réduit (conçu pour qu'un ALTER partiel ne
   fasse pas disparaître les dates) → la lecture **réussit** mais perd `outlookEventId` ;
2. l'app croit donc qu'aucune projection n'existe → elle **crée** l'événement Outlook ;
3. `enregistrerProjection` échoue (colonne absente) → `memorise = false` ;
4. le filet anti-orphelin (« jamais de doublon ») **supprime l'événement tout juste créé**.

Rien n'est logué : ni l'échec de lecture (rattrapé), ni la suppression (nominale).

**Correctif appliqué** : le fichier SQL porte désormais des `alter table ... add column if
not exists` sur les 6 colonnes ajoutées après coup. Règle consignée en tête d'`EXECUTES.md`
— ce piège a pu frapper d'autres tables.

### Hypothèses écartées en chemin (à ne pas ressortir)

- **`MAIL_SOURCE` absent de Vercel** : FAUX. Il est bien posé — le bouton « mail au CS »
  s'affiche (il dépend du verrou global `mailModuleActif`) et « Ton agenda : libre » répond.
- **403 Exchange Application Access Policy** : FAUX. Testé en direct avec le jeton app-only :
  rôles accordés = `Calendars.ReadWrite` (+ Mail.*), lecture des calendriers **200** sur la
  boîte perso comme sur les salles, `getSchedule` **200**. Graph n'a jamais été en cause.
- **« Mes e-mails » grisé** : n'est PAS un symptôme du même problème. Il dépend de
  `mailModuleActifPour` (verrou global **+** allowlist) → `MAIL_PILOTES` est posé et ne
  contient pas l'adresse de Sekou. C'est cohérent et voulu ; ça n'affecte pas la projection.

> **Leçon** : deux symptômes qui « se recoupent » sur une seule cause peuvent parfaitement
> dépendre de deux gates différents. Vérifier QUEL gate chaque symptôme utilise avant de
> conclure à une cause unique — j'ai perdu du temps sur cette fausse corrélation.

### Reste à faire sur ce sujet (non couvert par le correctif)

Note utile pour la suite : le **provider calendrier est gardé par la MÊME variable**
(`router.ts:359` — `MAIL_SOURCE === "graph"` → `GraphCalendrierOutboundProvider`, sinon
`Noop`). Il n'y a pas de second verrou d'environnement caché.

### Trou de traçabilité : deux échecs sur trois sont totalement muets

Dans `projeter-evenement-outlook.ts`, la projection peut échouer de trois façons, et **une
seule laisse une trace** :

| Chemin | Trace |
|---|---|
| Exception (403 Graph, timeout, réseau) | ✅ `console.warn("[projection-outlook] projection impossible pour <copro> <type>")` |
| `if (!boite) return;` — aucun agenda cible | ❌ **rien** |
| `creerEvenement` ne renvoie pas d'id (provider noop) | ❌ **rien** |

**À faire** : tracer les deux chemins muets avec le même `console.warn` discret et sans PII
(code copro + type seulement, comme l'existant et comme la trace `getSchedule` posée le
27/07). Sans ça, tout diagnostic de « la date n'apparaît pas dans l'agenda » repart de zéro.

### Le vrai défaut de code : la fausse réservation de salle

Indépendamment de la variable, **l'écran ment**. L'éditeur de date
(`src/components/fiche-copro/editeur-date.tsx`) propose de réserver une **salle**, la **voiture
ZOE**, un **mode de tenue** et d'**associer des collègues**. Tout est bien persisté en base
(`enregistrerRessources`, `enregistrerModeReunion`, `enregistrerCollaborateurs` dans
`definir-date-evenement.ts:46-67`), puis `projeterEvenementOutlook` est appelé — et ne fait
rien, en silence. Résultat : le gestionnaire croit avoir réservé la salle, **la salle n'est pas
réservée** et personne n'est prévenu. C'est le motif « dégradation silencieuse sur une
écriture demandée » déjà identifié le 27/07 sur les dates, avec ici une conséquence pire
qu'un affichage faux : une réservation fantôme.

**À faire** :
- Quand le gate est fermé (`mailModuleActif() === false`), l'éditeur de date doit le **dire**.
  Deux niveaux possibles, au choix de Sekou :
  - **minimum** : un message discret sous les champs de réservation — « La synchronisation
    Outlook est désactivée : la date est enregistrée dans l'intranet, mais la salle et les
    invitations ne seront pas posées dans les agendas. »
  - **plus net** : masquer/désactiver les champs salle · ZOE · collègues tant que le gate est
    fermé, puisqu'ils ne produisent aucun effet réel.
- L'information doit descendre du **serveur** (le gate lit `process.env`, indisponible côté
  client) : passer un booléen `projectionOutlookActive` en prop depuis le composant serveur
  qui rend la fiche, jusqu'à `EditeurDate`. Ne PAS appeler `mailModuleActif()` dans un
  composant client (il retournerait toujours `false`).
- **Ne pas retirer la dégradation propre** de `projeterEvenementOutlook` : elle est correcte
  (Outlook ne doit jamais bloquer la pose d'une date). Ce qu'on ajoute, c'est de rendre
  l'état **visible à la saisie**, en amont — pas de faire échouer l'écriture.
- Vérifier au passage le même angle mort sur les **créneaux dérivés** AG (« Mise sous pli »
  J-31, « Relance date AG » J-7, `projeter-creneaux-ag.ts`) : eux aussi silencieux.

---

## 4. Aucun moyen d'annuler un lot de facturation trimestrielle

**Gravité** : gênant (pas un bug — un manque qui a coûté une intervention manuelle en base
et en API sur un système comptable réel).
**Où** : `src/components/gestion-courante/panneau-gestion-courante.tsx`,
`src/lib/services/facturation/gestion-courante.ts`, `src/lib/ports/invoicing-provider.ts`.

**Ce qui s'est passé le 28/07** : lancement accidentel de la facturation de gestion courante
2026-T3 sur **253 copropriétés** (457 538,31 € HT) pendant la session E2E, en **prod**.
253 lignes créées dans `intranet_factures`, **242 brouillons Pennylane** émis (11 en erreur).
Nettoyage fait à la main par script : 242 brouillons supprimés côté Pennylane (tous vérifiés
`draft=true` avant suppression), puis 253 lignes supprimées en base. Les 3 factures
**finalisées** de GG (S143, S274, S276) ont été explicitement exclues et vérifiées intactes.

**Le garde-fou existe et il est correct** : case à cocher rappelant le nombre de copros, la
période et le montant total, bouton désactivé tant qu'elle n'est pas cochée. Ce n'est pas lui
qui a manqué. Ce qui manque, c'est **l'après**.

**Le vrai manque** : une fois lancé, un lot est **irréversible depuis l'application**.
- Pas de bouton « annuler ce lot » : il a fallu écrire un script ad hoc contre l'API Pennylane.
- Le port `InvoicingProvider` **n'a aucune méthode de suppression** — seulement
  `creerFactureBrouillon`. L'app sait créer, elle ne sait pas défaire.
- La boucle d'émission vit dans **une seule action serveur** (`lancerGestionCourante` crée
  toutes les lignes puis boucle sur les POST) : fermer l'onglet ne l'arrête pas, et rien ne
  permet de l'interrompre. Elle est allée jusqu'au bout pendant qu'on constatait le problème.

**À faire (à arbitrer avec Sekou avant de coder — c'est un vrai sujet de conception)** :
- Ajouter `supprimerFactureBrouillon(id)` au port `InvoicingProvider` + son implémentation
  Pennylane (`DELETE /api/external/v2/customer_invoices/{id}`, vérifié : renvoie `204`, la
  relecture renvoie ensuite `404`).
- **Garde absolue** : ne jamais supprimer une facture dont `draft !== true`. Une facture
  finalisée porte un numéro légal ; elle s'annule par un avoir, jamais par une suppression.
  Le script de nettoyage a relu chaque facture avant de la supprimer — reprendre ce principe.
- Exposer une annulation de lot dans l'UI, bornée au lot qu'on vient de créer (même liste
  d'ids que celle passée à `emettreFacturesEnAttente`), avec la même confirmation chiffrée
  que le lancement.
- Question ouverte pour Sekou : faut-il aussi **borner l'accès** au lancement trimestriel
  (aujourd'hui accessible depuis la sidebar de tout profil qui voit Gestion courante) ?

> Note de méthode : c'est le `pennylane_invoice_id` stocké en base qui a rendu le nettoyage
> possible. **Ne jamais supprimer les lignes `intranet_factures` avant les brouillons
> Pennylane** — sinon les brouillons deviennent orphelins et introuvables autrement qu'à la
> main dans Pennylane.

---

## 5. Les échecs d'émission sont comptés mais jamais expliqués

**Gravité** : gênant (rend tout incident de facturation non diagnosticable).
**Où** : `src/components/gestion-courante/panneau-gestion-courante.tsx:63-67`.

Le lancement du 28/07 a fini sur **242 émises / 11 en erreur**. L'utilisateur voit un toast :

```
242 facture(s) émise(s), 11 en erreur.
```

…et rien d'autre. Or le service **calcule et renvoie le détail** :
`ResultatLancementGc.erreurs: Array<{ coproCode, message }>` (rempli dans
`gestion-courante.ts` et `emettre-factures-en-attente.ts`). **L'UI le jette.** Le seul autre
endroit où l'information survit est la colonne `pennylane_error` de `intranet_factures` —
donc elle disparaît avec la ligne.

**À faire** : afficher les échecs (copro + message) à l'écran après un lancement — au minimum
une liste dépliable sous le toast, idéalement une section persistante dans l'historique de
facturation. Le détail existe déjà côté serveur, il n'y a rien à recalculer.

---

## 6. Facturation : la résolution du client Pennylane ne connaît que le miroir Crypto

**Gravité** : bloquant à terme (structurel) — se déclenchera de plus en plus souvent.
**Où** : `getClientFacturationRef` dans l'adapter Supabase de facturation
(`supabase-facturation-repository`, ~ligne 341).

**Constat** (reconstitué après coup — cf. note d'honnêteté plus bas). Sur les 264 copros
présentes dans `intranet_suivi_contrats`, **6 n'ont aucun identifiant client Pennylane
résolvable** : `S0297`, `S0299`, `S0303`, `S0304`, `S0305`, `S0306`. Ce sont **exactement des
copros eStale**.

Deux causes distinctes, à ne pas confondre :

1. **5 copros sont absentes du miroir** (`S0297`, `S0303`, `S0304`, `S0305`, `S0306`) : elles
   n'existent que dans eStale, elles n'ont jamais été mirrorées dans `public."Copropriete"`.
2. **1 copro est présente mais sans `pennylaneId`** (`S0299` → présente sous `S299`,
   `pennylaneId = NULL`).

**Et un défaut de normalisation par-dessus** : `intranet_suivi_contrats` stocke la référence
**paddée** telle qu'eStale la renvoie (`S0299`), alors que le miroir stocke la forme courte
(`S299`). `getClientFacturationRef` interroge `referenceCrypto` puis `referenceEstale` **avec
le code brut**, sans passer par `normaliserRef` (qui existe pourtant dans
`lib/domain/copro-fusion.ts` et est utilisé partout ailleurs pour exactement ce problème).
Donc même `S0299`, qui EST dans le miroir, n'est pas retrouvée.

**Le fond du problème** : la facturation résout son client Pennylane **uniquement** dans
`public."Copropriete"`, la table Prisma de l'App A (Crypto). Or eStale est la source primaire
et Crypto est transitoire (« on build surtout pour eStale, le build Crypto c'est pour 7 mois »).
**Chaque copro qui naît dans eStale sans passer par Crypto sera infacturable**, silencieusement.
Les 5 copros absentes du miroir en sont la démonstration : ce n'est pas un incident, c'est le
régime permanent qui s'installe.

**À faire** :
- Correctif immédiat, sans risque : passer le code par `normaliserRef` dans
  `getClientFacturationRef` avant les deux requêtes. Récupère `S0299` et tout futur cas de
  padding. Ne règle PAS les 5 copros absentes du miroir.
- Décision de fond à prendre avec Sekou : **où vit le `pennylaneId` d'une copro eStale ?**
  Trois options à instruire — le porter dans une table native `intranet_*`, le lire depuis
  eStale s'il y existe un champ adéquat, ou continuer d'exiger le passage par le miroir.
  C'est un choix d'architecture (quelle source pour quelle donnée, ADR), pas un patch.
- Dans tous les cas : à l'aperçu de facturation, **signaler en amont** les copros qui n'ont
  pas de client Pennylane résolvable, au lieu de les laisser échouer une par une à l'émission.

> **Note d'honnêteté (méthode)** : ces 11 erreurs avaient leur message exact stocké dans la
> colonne `pennylane_error`. J'ai supprimé les 253 lignes de nettoyage **sans les lire
> d'abord** : le diagnostic direct est perdu. Ce qui est écrit ci-dessus est une
> reconstitution par relecture du code et de la base — solide pour les 6 copros nommées,
> **muette sur les 5 autres échecs**. Leçon : avant toute purge, extraire et conserver les
> colonnes de diagnostic.

---

## 7. Une copro d'une agence sans salle affiche « Aucune salle » sans rien expliquer

**Gravité** : confort (mais coûte un signalement de bug — c'est arrivé le 28/07).
**Où** : `src/components/fiche-copro/editeur-date.tsx` (~lignes 392-407),
`src/lib/domain/salles-reunion.ts`, `src/lib/domain/cloisonnement-agence.ts`.

Sekou : « je ne peux pas réserver de salle ». Ce n'était **pas un bug**. SE999 est rattachée
à une agence qui n'a **aucune salle propre** (ASN, cf. le commentaire de `salles-reunion.ts`
— « ASN n'a pas de salle propre, ses copros passent par le débordement »). Le sélecteur
affiche donc « Aucune salle » et **toutes** les salles sont repliées derrière le lien
« Voir les autres agences ».

Le comportement est conforme au design (cloisonnement par agence = confort d'affichage), mais
**rien à l'écran ne dit que ton agence est vide** : le gestionnaire conclut que la
réservation est cassée.

**À faire** : quand la partition `memeAgence` est vide alors qu'une agence de référence
existe, remplacer le silence par une phrase — ex. « Cette agence n'a pas de salle : voir les
autres agences » — ou déplier d'office le débordement dans ce cas précis (les salles des
autres agences deviennent le choix par défaut, puisqu'il n'y en a pas d'autre).
Ne PAS supprimer le cloisonnement : il est utile pour les agences qui ont des salles.

---

## 8. Clôturer l'ODJ en « réunion terminée » → PDF sur l'extranet → supervision AG

**Gravité** : manque fonctionnel (demande Sekou, 28/07).
**Décision Sekou : on part sur l'option 1** — brique 1 seule d'abord, vérification de
l'hypothèse extranet en parallèle, choix du PDF ensuite.

**La demande** : « dans odj réunion on n'a pas la possibilité de clôturer l'ordre du jour en
mode "réunion terminée" pour que le pdf aille sur l'extranet de la copropriété et qu'on
puisse passer à la supervision AG ».

### État des trois briques

| Brique | État |
|---|---|
| **1. Clôturer l'ODJ + avancer le cycle** | N'existe pas. Partie simple. La checklist de supervision porte **déjà** l'item `apcs.cr-cs-extranet` « Compte rendu CS diffusé sur l'extranet » (`supervision-ag-template.ts:47`), coché à la main aujourd'hui. |
| **2. Produire le PDF côté serveur** | **N'existe pas.** Le « PDF » de l'ODJ est aujourd'hui le rendu navigateur de `/odj/[id]/imprimer` (`BoutonImprimer`). Aucun octet de PDF côté serveur. `pdfjs-dist` est un **lecteur** (extraction), pas un générateur. |
| **3. Pousser le fichier dans eStale** | **Prouvé mais pas construit.** `updateMeeting(id).createFile(fileCategory, file:Upload)` en multipart graphql — démontré pendant le chantier signature (cf. `docs/CHANTIER-signature-electronique-AG.md`), mais uniquement dans des scripts jetables : ni port, ni adapter. Chantier en pause. |

### ⚠️ L'hypothèse à vérifier AVANT de choisir la voie du PDF

**Un fichier attaché au Meeting eStale apparaît-il réellement sur l'extranet de la
copropriété ?** Rien ne le prouve. Les notes du chantier signalent que les catégories sont
restrictives (`TRANSCRIPT_ATTENDANCE_SHEET` / `FORM` / `POWERS` refusent l'upload ; seule une
catégorie libre passe). Visible côté syndic ≠ visible côté copropriétaires.

→ **À tester sur SE999** avec les scripts existants du chantier (`estale-upload-poc.mjs`,
`estale-e2e-signature.mjs`). C'est une vérification, pas un développement.
**Si le test est négatif** : on s'arrête à la brique 1, le dépôt reste manuel, et on n'a pas
payé le prix d'un générateur de PDF pour rien.

### Le choix du PDF, à trancher APRÈS le test (ne pas décider seul)

- **Rendu headless** (Chromium sur Vercel) — réutilise *exactement* la page d'impression
  existante, donc **zéro divergence** entre l'aperçu écran et le fichier envoyé. Mais lourd :
  ~50 Mo de binaire, fonction lente, coût d'exécution.
- **Génération serveur** avec une lib PDF — léger et rapide, mais impose de **réécrire la mise
  en page** du document, qui divergera de `DocumentOdj` au premier changement de maquette.

### Périmètre de la brique 1 (ce qui est lancé)

- Un état « réunion terminée » sur l'ODJ (persisté ; l'ODJ est déjà porté par
  `intranet_odj_champs` via `getEtat` / `ODJ_SANS_DATE`).
- La clôture **avance le cycle** vers la supervision AG et **coche automatiquement**
  `apcs.cr-cs-extranet`.
- **Réversible** : on doit pouvoir rouvrir un ODJ clôturé par erreur (aucune écriture
  externe n'est engagée à ce stade).
- **Ne PAS** générer de PDF ni pousser quoi que ce soit dans eStale dans cette brique.

---

## 9. Signature Signitic absente du mail au CS — et le mock peut partir en VRAI mail

**Gravité** : gênant pour le symptôme, **risqué** pour ce qu'il révèle.
**Signalé par Sekou** le 28/07 : « dans l'envoi de mail au CS la signature n'est pas passée ».

### Ce qui est vérifié et hors de cause

- **L'API Signitic répond** : `GET /signatures/sekou.koma@real31.fr/html` → **HTTP 200**,
  12 529 octets, en **~250 ms** (4 appels mesurés). Insensible à la casse de l'email.
- **Pas un timeout** : `SIGNITIC_TIMEOUT_MS` vaut 10 s par défaut, on est 40× en dessous.
- **La chaîne de code est correcte** : `envoyerMailReunionAction` récupère la signature
  (`getSignatureGestionnaire`) et la passe à `envoyerMailReunion` ; l'adapter Graph
  concatène bien `monTexte + signature` dans `envoyerNeuf`.

### Le discriminant (à faire confirmer par Sekou)

Les deux causes restantes donnent des symptômes **opposés** — la réponse tranche seule :

| Ce que Sekou a vu | Cause |
|---|---|
| **Aucune signature du tout** | `SIGNITIC_API_KEY` **présente mais invalide/expirée** sur Vercel → le vrai adapter part, reçoit un 401/403, et retourne `null`. |
| **Une signature générique qui n'est pas la sienne** (« REAL31 - Gestionnaire de copropriété », barre verte) | `SIGNITIC_API_KEY` **absente** sur Vercel → `getSignatureProvider()` (`router.ts:366`) bascule sur `MockSignatureProvider`. |

**Trace ajoutée** (commit du 28/07) : l'adapter loguait `null` en silence sur les trois
chemins d'échec. Il émet désormais un `console.warn` discret et **sans PII** (statut HTTP
seul, jamais l'email) — visible dans les logs Vercel, il donnera la réponse directement.

### ⚠️ Le vrai risque : le mock n'a aucune conscience du contexte

`getSignatureProvider()` bascule sur le mock dès que `SIGNITIC_API_KEY` est absente —
**sans regarder si le mail qui part est réel**. Or `MAIL_SOURCE=graph` est actif en prod.
Conséquence : **un vrai mail au conseil syndical peut partir avec une fausse signature**
(« REAL31 - Gestionnaire de copropriété », adresse `www.real31.fr`), envoyée à de vrais
copropriétaires depuis la boîte d'un vrai gestionnaire. Le mock a été écrit « pour tester
le rendu dans le cockpit sans clé Signitic » — un usage de dev qui n'a rien à faire dans un
envoi réel.

**À faire** : quand le provider de mail est RÉEL (`mailModuleActif()`), ne jamais servir la
signature mock — mieux vaut **aucune** signature qu'une fausse. Deux façons :
- borner le choix dans `router.ts` (`getSignatureProvider` renvoie un provider « vide »
  plutôt que le mock quand `MAIL_SOURCE=graph`) ;
- ou faire porter au mock un marqueur explicite que l'envoi réel refuse.
À arbitrer avec Sekou — la première est plus simple, la seconde plus explicite.
