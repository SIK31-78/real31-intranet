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

## 3. Date d'AG posée → rien dans l'agenda (ni le mien, ni celui de la salle)

**Gravité** : bloquant côté usage (fausse réservation de salle) — mais **la cause immédiate est
une variable d'environnement, pas le code**.
**Signalé par Sekou** le 28/07 sur prod : « j'ai fixé date d'AG mais celle-ci n'apparaît pas
dans mon agenda ni celui de la salle ».

> **Mise à jour du 28/07 (Sekou)** : `MAIL_SOURCE=graph` **est déjà posé** sur Vercel.
> Le diagnostic ci-dessous, qui concluait à une variable absente, est donc **faux dans sa
> conclusion** — mais la mécanique décrite (verrou global, gate unique partagé) reste exacte
> et utile. Voir « Reprise du diagnostic » plus bas.

### Cause immédiate (HYPOTHÈSE INITIALE, INVALIDÉE) — `MAIL_SOURCE` pas à `graph`

`projeterEvenementOutlook` (`src/lib/services/coproprietes/projeter-evenement-outlook.ts:65`)
sort à la première ligne sur `if (!mailModuleActif()) return;`, et `mailModuleActif()` n'est
vrai que si `process.env.MAIL_SOURCE === "graph"` (`src/lib/domain/mail-gate.ts:14`).

Confirmation croisée à l'écran : dans la sidebar, **« Mes e-mails » porte le badge
« À VENIR »**, ce qui n'arrive que si `emailsOuvert === false`, donc
`mailModuleActifPour(sekou) === false`. Si `MAIL_SOURCE` était à `graph` et que seul
`MAIL_PILOTES` excluait Sekou, la projection fonctionnerait quand même (elle utilise le gate
GLOBAL `mailModuleActif()`, sans allowlist). Les deux symptômes ne se recoupent que sur une
seule explication : **le verrou global est fermé**.

### Reprise du diagnostic (28/07, après retour de Sekou)

`MAIL_SOURCE=graph` est posé sur Vercel. Vérifié au passage : le **provider calendrier est
gardé par la MÊME variable** (`router.ts:359` — `MAIL_SOURCE === "graph"` → `GraphCalendrier
OutboundProvider`, sinon `Noop`). Il n'y a donc pas de second verrou d'environnement caché.

Deux pistes restent, dans cet ordre de probabilité :

1. **Le déploiement en ligne est antérieur à la pose de la variable.** Une variable
   d'environnement ajoutée dans Vercel n'est PAS injectée dans un déploiement déjà construit :
   il faut redéployer. Dans ce cas `process.env.MAIL_SOURCE` vaut `undefined` à l'exécution et
   les DEUX symptômes retombent sur cette cause unique (« Mes e-mails » grisé + aucune
   projection). **Un push a été fait le 28/07 → un déploiement neuf a été déclenché** :
   retester la pose d'une date d'AG sur SE999 après qu'il soit en ligne.
2. **`MAIL_PILOTES` est posé et ne contient pas l'adresse de Sekou.** C'est cohérent avec
   « Mes e-mails » grisé (qui utilise `mailModuleActifPour`, avec allowlist), mais PAS avec
   l'absence de projection (qui utilise `mailModuleActif`, sans allowlist). Si ce cas se
   confirme, l'absence dans l'agenda vient d'ailleurs : le plus probable est un **403 Exchange
   Application Access Policy** (envoi app-only depuis la boîte de chacun, la policy DSI doit
   couvrir la boîte visée) — dépendance déjà tracée au ROADMAP.

**Comment trancher** : chercher `[projection-outlook]` dans les logs runtime Vercel.
⚠️ Mais voir le trou de traçabilité ci-dessous : **ne rien voir ne prouve rien**.

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
