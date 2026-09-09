# Checklist complète d'une reprise de copropriété dans eStale

> Consolidée le 09/09/2026 depuis le skill `estale-migration` (SKILL.md + 30 annexes,
> six reprises menées : S0303, S0304, S0297, S0306, S0305, S0299). Chaque ligne vient
> d'une règle mesurée sur une reprise réelle — aucune n'est théorique.
> 
> Usage : c'est la **checklist de suivi humain** à porter dans le module intranet
> (`ETAPES_REPRISE`, aujourd'hui 15 étapes, périmée). Une case cochée = fait **et vérifié**.
> Les ⚠ sont les pièges qui ont coûté, chacun avec sa copro d'origine.

---

## Phase 0 — Cadrage (avant d'ouvrir un seul chiffre)

| #   | Étape                                                                                                                                                                                                       | Preuve / contrôle                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| C1  | Référence eStale, nom, adresse, **date de bascule** (= date d'effet du mandat, lue dans le PV d'AG qui nomme le cabinet, pas déclarée)                                                                      | PV OCRisé, résolution citée                                                  |
| C2  | **Chaîne des syndics** écrite noir sur blanc : qui, de quand à quand, avec quel logiciel                                                                                                                    | ligne « Solde antérieur au JJ/MM (reprise par X) » du GL, en-tête `PERDU LE` |
| C3  | Périmètre tranché : patrimoine + compta, ou compta seule ? Exercice N-1 complet + N jusqu'à la bascule (jamais « les soldes »)                                                                              | décision au dossier                                                          |
| C4  | **Exercice décalé ?** Nommer par les bornes, jamais par l'année                                                                                                                                             |                                                                              |
| C5  | **Le compte bancaire change-t-il, ou reprend-on le même ?** ⚠ S0305 : compte séparé au nom du syndicat, RIB inchangé → l'argent n'a jamais quitté la copro, rien à réclamer au sortant                      | confirmation banque + IBAN de l'appel du sortant                             |
| C6  | **Âge de l'immeuble** (< 5 ans après réception → dispense de fonds ALUR)                                                                                                                                    |                                                                              |
| C7  | État eStale relevé, pas supposé : exercices existants (bornes, verrouillé/clos), clés (code, libellé, **tantièmes réels** — une clé à 0/0 n'est pas utilisable), plan comptable, fournisseurs de l'annuaire | `estale_verif.mjs etat` + `refs` + `plan`                                    |
| C8  | Gestion courante déjà saisie par le cabinet avant la reprise ? **Relever ses soldes AVANT le premier import** (après, impossible à isoler) ⚠ S0297                                                          | sonde soldes                                                                 |

---

## Phase 1 — Documents à réunir

**Réclamer en Excel d'abord** (GL, RGD, balance) : le PDF est un repli, et il se dit.
⚠ Chercher chaque document **dans tout le dossier** (`find -iname`), pas dans le sous-dossier
qui porte son nom (S0304 : les RGD du sortant étaient à la racine). Un PDF scanné
**s'OCRise soi-même**, il ne se rend jamais au gestionnaire.

### 1a. Comptabilité — indispensables

| #   | Document                                                                                                                                                                                 | Pourquoi / contrôle d'entrée                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | **Grand livre N-1 complet**, un fichier par exercice, **après répartition**                                                                                                              | reports classe 6/7 = 0 (sauf `702`) ; export daté APRÈS l'AG d'approbation      |
| D2  | **Grand livre N** (exercice en cours) jusqu'à la bascule — ⚠ il peut porter **la répartition de N-1** (sortant qui répartit à la date de l'AG, en N) : le parseur lit tout GL en trois blocs *reports · mouvements · répartition* et écarte le troisième                                                                        | raccord N-1 → N compte par compte au centime                                    |
| D3  | **RGD de chaque exercice** — seul document portant TVA + déductible + récupérable + clé par poste                                                                                        | total par poste = total imprimé ; classe 6 GL hors répartition = RGD au centime |
| D4  | **Balance à la date de bascule** — LE filet de sortie                                                                                                                                    | 53/55 comptes S0305                                                             |
| D5  | **Appels de fonds du sortant** (tous les trimestres de N-1 et N) — ventilation du `701` par clé, tantièmes par lot, avances nominatives                                                  | Σ appelé par clé = compte `7010`                                                |
| D6  | **PV de la dernière AG** (budgets votés, révision de l'exercice en cours, travaux, fonds ALUR) + **feuille de présence**                                                                 |                                                                                 |
| D7  | **Annexes comptables** de la convocation : annexe 1 bis (soldes après répartition), **annexe 3** (budget par poste et par clé), **annexe 5** (travaux votés non clôturés, avec leur clé) |                                                                                 |
| D8  | **Contrat de syndic signé** (forfait, date d'effet)                                                                                                                                      |                                                                                 |

⚠ Un dossier peut contenir **63 exports du même GL** (S0305) : rééditions, pas fragments.
Garder le plus récent sans filigrane « PROJET » ; vérifier pages + date d'édition.

### 1b. Comptabilité — très utiles

| #   | Document                                                                                       | Ce qu'il débloque                                                                                              |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D9  | **Situations de compte individuelles** / décomptes de charges de chaque copropriétaire         | avance de trésorerie et fonds travaux **par copropriétaire** ; index de compteurs par lot                      |
| D10 | **Décomptes de compteurs** du prestataire (Techem, Proxiserve…) : n° de série, index, forfaits | module Compteurs ; ⚠ ne jamais déduire le drapeau « forfait », le lire                                         |
| D11 | Balance de clôture N-1 du sortant                                                              | filet n°2                                                                                                      |
| D12 | **Factures** des fournisseurs (au moins une par tiers)                                         | SIREN + adresse de facturation ; règle ORONA : un tiers s'identifie par son SIREN, jamais par le nom du compte |
| D13 | PV **antérieurs** (fonds ALUR voté / soldé / repris, travaux votés)                            | ⚠ S0297 : trois états successifs du fonds sur trois PV                                                         |
| D14 | Pré-états datés / dossiers de ventes                                                           | avances par lot ; **un « parti » qui paie encore ses appels est l'alarme n°1**                                 |
| D15 | Journal d'inventaire du sortant                                                                | prix unitaires eau/énergie (`1395 M3 x 11.7`)                                                                  |

### 1c. Patrimoine (si reprise du patrimoine)

| #    | Document                                                                                                                         | Rang                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| P-D1 | **RCP + EDD** et **tous les modificatifs** — à lire AVANT de produire ⚠ S0304 : lot 191 supprimé, lot 194 créé, totaux inchangés | fait foi                                 |
| P-D2 | **Feuille de présence** de la dernière AG (les copropriétaires d'aujourd'hui)                                                    |                                          |
| P-D3 | Fiche synthèse du registre national, PV d'AG (nb de lots, nb de copropriétaires)                                                 | cadrage                                  |
| P-D4 | Appels de fonds du sortant, états datés                                                                                          | **recoupement seulement**, jamais source |

---

## Phase 2 — Extraction et contrôles d'entrée (avant tout mapping)

| #   | Étape                                                                                                                                                                                                                                | Attendu              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| E1  | Parser chaque source par **position de colonne** (en-têtes relevés **page par page**, jamais devinés)                                                                                                                                | 0 ligne non reconnue |
| E2  | **Filet n°1** : totaux imprimés de chaque compte du GL reproduits (report inclus ou non : le **tester** sur un compte connu)                                                                                                         | 0 écart              |
| E3  | Équilibre global débit = crédit, reports inclus                                                                                                                                                                                      | 0,00                 |
| E4  | **Filet n°2** : raccord N-1 → N compte par compte                                                                                                                                                                                    | 0 écart, 0 orphelin  |
| E5  | RGD : total de **chaque poste** = total imprimé ; identité d'un poste = (compte, clé, libellé de clé)                                                                                                                                | 0 poste en écart     |
| E6  | Classe 6 du GL hors répartition = RGD, compte par compte                                                                                                                                                                             | au centime           |
| E7  | Σ appels de fonds par clé = compte `7010` ; Σ avances nominatives = compte `1031` ; Σ index compteurs = m³ du RGD                                                                                                                    | au centime / au m³   |
| E8  | **Où le sortant a-t-il mis sa répartition ?** En N (REACT, Foncia journal `RCRG`) ou en N+1 (Matera) — décidé par la **structure** (classes 6/7 soldées vers un pivot + `489` alimentés), contrôlé par le libellé, désaccords listés | écrit au rapport     |
| E9  | Plusieurs syndics : le sortant a-t-il repris en **soldes** ? Ne jamais importer les deux GL bout à bout                                                                                                                              | doublon exclu        |
| E10 | Signature de chaque document : la numérotation des comptes est bien celle du GL repris (pas celle du syndic d'avant)                                                                                                                 |                      |

---

## Phase 3 — Patrimoine (si dans le périmètre)

| #   | Étape                                                                                                                         | Contrôle                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| P1  | Modificatifs d'EDD lus, chaîne des actes écrite                                                                               |                             |
| P2  | Extraction lots / clés / copropriétaires / attributions ; **clés eStale existantes font foi** (R1)                            | récap validé par un GO      |
| P3  | `auto_checks.py` **lancé** (pas invoqué)                                                                                      | 0 erreur                    |
| P4  | Attribution croisée avec le **dernier appel de fonds** émis et le **dossier Ventes** (foyer sous deux noms : SCI et gérant)   | 0 « parti » qui paie encore |
| P5  | Import UI dans l'ordre : **Lots → Clés → Tantièmes → Owners → Codes eStale → Links**                                          |                             |
| P6  | Post-import : nb lots = fiche synthèse ; total de chaque clé ; 0 lot orphelin ; 0 copropriétaire sans lot ; spot-check 3 lots |                             |
| P7  | Attribution fausse → écran **Attribution**, jamais le module de vente                                                         |                             |

---

## Phase 4 — Mapping comptable et production des fichiers

| #   | Étape                                                                                                                                                                                                                                                | Contrôle / piège                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| M1  | **Fournisseurs** recensés sur tout le GL, créés ou **rattachés** (jamais dupliqués — « Ajouter », pas le nom) ; adresse sur facture, SIREN vérifié                                                                                                   | ⚠ ORONA S0305 : 2 comptes Foncia = 1 société |
| M2  | Comptes classe 6 manquants créés (GL **et** budget — R19) ; convention de nommage du cabinet                                                                                                                                                         | `plan-comptable-cabinet.md`                  |
| M3  | **Opérations de travaux** créées AVANT l'import, dans l'ordre du fichier (`T0x` = ordre de création), date de début large ; **suffixes relus** après création                                                                                        | `estale_verif.mjs plan`                      |
| M4  | Compte « copropriétaire parti » : **fiche copropriétaire sans lot** (pas un `471`) ⚠ S0305                                                                                                                                                           |                                              |
| M5  | Comptes d'attente : `4719999` / `4719998` **uniquement si le sortant détient les fonds** (voir C5)                                                                                                                                                   |                                              |
| M6  | Appariement `450` / `401` **sur le NOM** (R13), homonymes forcés à la main, bijection vérifiée par famille (R16), poste du RGD qui décide (R17)                                                                                                      | couples litigieux figés dans `mapping.py`    |
| M7  | Classe 6 depuis le **RGD** (TVA, déductible lu ou vide — jamais calculé, récupérable) ; journal et pièce lus à la source                                                                                                                             | Σ TVA/déd./récup. = RGD                      |
| M8  | **Acomptes de travaux planqués en classe 6** chassés (libellés `ACOMPTE`, `TRAVAUX`, `AG DU`) ⚠ S0303                                                                                                                                                |                                              |
| M9  | Répartition du sortant **retirée** du fichier (eStale la refait au verrouillage) ; `489` jamais mappé ; à-nouveaux de N absents si N-1 est clôturé dans eStale — **sauf** bloc `102 ↔ 120` travaux (gardé)                                           |                                              |
| M10 | Consommations individuelles (eau, chauffage, répartiteurs) **retirées du fichier** : elles passent par le module Compteurs ⚠ S0305 : 10 682 € déplacés sinon                                                                                         |                                              |
| M11 | Classes 1 et 7 : ce qui a des **sous-comptes par lot** va à l'**Éclatement** (`701`, `1031`, `105`, `702T0x`) ; **proportionnalité mesurée** (avance ∝ tantièmes ? sinon Expert au détail) ; clé qui change de base → agréger par clé sur l'exercice | Σ par clé = `7010`                           |
| M12 | Clé de chaque opération de travaux **prouvée** (annexe 5, ou 2 copropriétaires sur les appels — R18) ; sinon « NON PROUVÉE »                                                                                                                         |                                              |
| M13 | Libellés : aucun vide (import bloqué), **accents** partout (visible sur les relevés) ⚠ S0305                                                                                                                                                         |                                              |
| M14 | **`auto_checks_compta.py` lancé** — 11 contrôles, dont balance par compte cible vs sortant (le seul qui attrape un mapping faux mais bijectif)                                                                                                       | 0 erreur, > 0 ligne                          |
| M15 | Livrable **`<REF>_mapping-reprise.xlsx`** (10 feuilles) + `entries_<AAAA>.xlsx` + `eclatement.xlsx` + rapport `01-ANALYSE-COMPTA.md`                                                                                                                 |                                              |

---

## Phase 5 — Mise en place dans eStale (gestes UI, dans cet ordre)

| #   | Étape                                                                                                                                                                                      | Piège                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| U1  | **Compte bancaire** de la copro (`5120001`) — séparé ; connexion bancaire                                                                                                                  |                                      |
| U2  | **Exercice N-1** créé via son budget général (l'UI seule sait créer un exercice antérieur ; **supprimer le budget supprime l'exercice**) ; **N+1 doit exister avant de clôturer N**        |                                      |
| U3  | Fournisseurs, comptes, comptes de passage, opérations de travaux, fiche « parti » créés (M1–M4)                                                                                            |                                      |
| U4  | **Compteurs** créés si clé compteur : catégorie choisie d'après le **compte du sortant** (non modifiable après) ; un compteur par compte racine (eau chaude = 2 : part eau + part énergie) | ⚠ S0306 : 200 mutations pour refaire |
| U5  | Compte de chauffage : **clé `701` posée sur les écritures** (le compte `6030000` garde `001`, non modifiable) ⚠ S0305 : 22 845 €                                                           | à rejouer à chaque relevé            |

---

## Phase 6 — Import et bouclage de l'exercice N-1

| #   | Étape                                                                                                                                                                                                                                                                          | Contrôle                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| I1  | Import **Expert** `entries_N-1.xlsx` (transactionnel : un refus n'écrit rien — relire quand même à la sonde avant de rejouer)                                                                                                                                                  | nb d'écritures = fichier        |
| I2  | **Éclatements** classes 1/7 dans l'UI (jamais par API : arrondi au centime supérieur non reproductible) ; « Compenser en 450 » = **Non** ; **lire la répartition proposée** avant de valider (lots exclus à 0,00) ; clé dans le libellé si deux éclatements sur le même compte | bandeau équilibré               |
| I3  | Module Compteurs : relevé, compteurs individuels (identifiants **uniques**, suffixe dès le 2e), index avec drapeau forfait **lu**, « Répartir » ; clé `C0x` remplie = `R0x`                                                                                                    | `sonde_compteurs.mjs`           |
| I4  | **Balance à 0** ; **comparaison à la balance du sortant compte par compte** (un éclatement sur le mauvais compte laisse la balance à 0)                                                                                                                                        | 0 écart hors familles attendues |
| I5  | Total des `45x` inchangé après éclatements                                                                                                                                                                                                                                     |                                 |
| I6  | **Verrouiller** (déclenche la répartition) → comparer **chaque `450`** au décompte approuvé en AG (le seul contrôle qui voit l'argent déplacé entre copropriétaires)                                                                                                           | 29/29 S0305                     |
| I7  | Écarts de répartition : **OD d'alignement** sur le décompte approuvé (résidu `488`), datée du 1er jour de N, libellé accentué et parlant (« Calage de reprise »)                                                                                                               | tous au centime                 |
| I8  | **Clôturer** à la **date d'approbation en AG** (provisoire si non approuvé ; réversible) ; lire ce que la clôture a généré (à-nouveaux par lot, `702T0x`, régularisations)                                                                                                     |                                 |

---

## Phase 7 — Exercice N (en cours) et bascule

| #   | Étape                                                                                                                                                                                                             | Contrôle                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| N1  | Fichier N **sans à-nouveaux** (la clôture les a posés), éclatements N au journal **À-nouveaux / CARRYFORWARD** aux dates réelles                                                                                  |                         |
| N2  | Import Expert + éclatements N                                                                                                                                                                                     | balance 0               |
| N3  | **Contrôle de sortie** : tous les comptes eStale vs balance du sortant à la bascule ; les 4 écarts légitimes neutralisés (cumul 6/7 du sortant, travaux reportés, `450` post-répartition, notre gestion courante) | chaque écart nommé      |
| N4  | OD **« Récupération gestion banque »** si le compte est le même (`4719999` → `5120001`) ; sinon attendre le virement du sortant                                                                                   |                         |
| N5  | **Rapprochement bancaire** de la bascule à aujourd'hui (opérations comptabilisées par le sortant mais sorties en banque après ; mouvements non comptabilisés)                                                     | solde banque au centime |
| N6  | Individualisation des compteurs **repointée sur la bonne clé**                                                                                                                                                    |                         |

---

## Phase 8 — Exploitation (ce qu'aucune doc n'écrit)

| #   | Étape                                                                                                                                                                                                                  | Piège                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| X1  | **Dernier PV dépouillé** : révision de l'exercice en cours, budget N+1, fonds ALUR, travaux, clauses d'exigibilité                                                                                                     | le PV fait foi, l'annexe ne donne que la ventilation |
| X2  | **Budget N** voté saisi (ligne à ligne, par clé ; une ligne retirée du vote → 0, pas oubliée) ; `amountFTR` (« à voter ») reste vide si l'AG a déjà voté                                                               | Σ = vote au centime                                  |
| X3  | **Échéancier de rattrapage** : échéances du sortant aux montants réels, **« À envoyer » décoché** ; restantes = (voté − appelé) / n                                                                                    | Σ = voté                                             |
| X4  | **Budget N+1** voté saisi + échéancier                                                                                                                                                                                 |                                                      |
| X5  | Fonds ALUR : **seulement si voté** (voir C6, D13) ; suggestion eStale = plancher 5 %, pas le voté                                                                                                                      |                                                      |
| X6  | Honoraires : ligne `6211` du budget suffit — **pas de `generateFees`** (décision cabinet : Pennylane)                                                                                                                  |                                                      |
| X7  | Opérations de travaux : **montant voté** posé (ligne de budget exceptionnel), sinon l'état daté sort vide ; opérations dormantes **non clôturées** ; factures de solde non saisies cherchées                           |                                                      |
| X8  | **Premier appel de fonds** : texte d'accompagnement (Markdown : astérisques **collées** au texte), hausse expliquée si réajustement, RIB inchangé ou nouveau, fiche de renseignements jointe, **PDF relu** avant envoi | pages A4 vs Letter                                   |
| X9  | Art. 18-2 : réclamation au sortant (trésorerie sous 1 mois, état des comptes sous 2) — **si** il détient quelque chose                                                                                                 |                                                      |
| X10 | Débiteurs relancés, factures fournisseurs en attente réglées, `4620000` créditeurs divers apuré                                                                                                                        |                                                      |
| X11 | Fiches de renseignements retournées : e-mails, extranet, RIB, LRE                                                                                                                                                      |                                                      |
| X12 | Documents du sortant versés sur l'extranet ; contrats, DPE, PPPT, BAN                                                                                                                                                  |                                                      |

---

## Phase 9 — Livraison et capitalisation

| #   | Étape                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Récap à la gestionnaire** (comptes, urgences, ce qui reste, ce qu'elle doit savoir) — chiffres **relevés en base le jour même**, jamais de mémoire ⚠ `solde` d'eStale est inversé, utiliser `balance` |
| L2  | Mail d'accompagnement                                                                                                                                                                                   |
| L3  | Travail pérennisé **à côté du dossier client** (`Reprise/travail/`), jamais dans un scratchpad                                                                                                          |
| L4  | **Skill mis à jour** : chaque piège nouveau écrit, chaque règle fausse **écrasée** ; `cas-<ref>.md` ; SKILL.md ≤ 300 lignes                                                                             |
| L5  | Mémoire projet + ROADMAP                                                                                                                                                                                |

---

## Ce que le module intranet ne trace pas aujourd'hui

Les 15 étapes actuelles (`R1`→`R11`, `RB1`, `RB2`, `RG1`, `RD1`) couvrent la phase
patrimoine et l'import compta « à venir ». Manquent, dans l'ordre d'apparition sur les
six reprises :

- **Cadrage** : chaîne des syndics, compte bancaire identique ou non, âge de l'immeuble,
  état eStale relevé, gestion courante pré-reprise isolée (C2, C5, C6, C7, C8).
- **Documents** : appels de fonds, annexes 1 bis / 3 / 5, situations de compte,
  décomptes de compteurs, factures, PV antérieurs, contrat (D5–D15).
- **Contrôles d'entrée chiffrés** (E1–E10) : le module a les filets n°1 et n°2, pas le
  RGD par poste, ni Σ appels = `7010`, ni la localisation de la répartition du sortant.
- **Gestes UI préalables** (U1–U5) : exercice antérieur, opérations de travaux dans
  l'ordre, compteurs avec la bonne catégorie.
- **Le bouclage** (I2–I8) : éclatements, compteurs, comparaison compte par compte,
  verrouillage, contrôle des `450` au décompte approuvé, OD d'alignement, clôture.
- **L'exercice en cours** (N1–N6) : import amputé, contrôle de sortie, requalification
  banque, rapprochement.
- **L'exploitation** (X1–X12) : budgets, échéanciers de rattrapage, premier appel,
  art. 18-2 — la partie où se perdent les heures.
- **La capitalisation** (L4) : la mise à jour du skill est une étape, pas une option.

Trois étapes actuelles sont à **reformuler** : `R8` (« Inc. 3 — à venir » : l'import est
fait, par fichiers Excel et modules UI), `RB1` (« ouvert » suppose un nouveau compte —
c'est « identifié : même compte ou nouveau »), `R6` (le GL après répartition n'est qu'un
des dix contrôles d'entrée).



Ajout : Une fois tout ca fait il faut envoyer les fiches de renseignement et les appels de fonds


---

## Ajouts issus des procédures internes du cabinet (09/09/2026)

Quatre documents dépouillés (`docs/reprise/` : *Mémo Reprise copropriété* 2024, *REPRISE
COMPTABILITE* 2014-2024, *Reprise copro – Fiche CRYPTO* 2010, *Reprise d'une copropriété*
2013). La partie comptable y est entièrement couverte par les phases ci-dessus — souvent en
mieux. Ce qu'elles apportent, c'est **tout ce qui n'est pas de la compta** : banque comme
processus, courriers, fournisseurs, archives, registre, première AG. Aucune des quatre ne
parle d'assurance : trou comblé ici.

| # | Phase | Étape | Source |
|---|---|---|---|
| C9 | 0 Cadrage | **Rendez-vous avec le sortant** : remise des archives et des dossiers en cours (contentieux, travaux, sinistres, ventes), PV de remise daté | 2013 |
| C10 | 0 Cadrage | **Rôles nommés** : gestionnaire, assistant(e), comptable, référent reprise, responsable bancaire | 2013, 2024 |
| D16 | 1b | Journaux du sortant (banque, achats) « si possible » | Crypto 2010 |
| D17 | 1c | **Liste des résidents / occupants**, distincte de la feuille de présence | 2013 |
| D18 | 1c | **Tous les contrats en cours** réclamés nommément | 2013 |
| B1 | 5a Banque | **Dossier d'ouverture de compte** (PV de nomination + RCP + contrat de syndic signé) remis au responsable bancaire — ou compte existant identifié (C5) | 2013 |
| B2 | 5a | **IBAN reçu** | 2024 |
| B3 | 5a | **ICS reçu** + émetteur SEPA paramétré dans eStale (donneur d'ordre « SDC … – REAL 31 ») : sans lui, aucun prélèvement | 2024, 2014 |
| B4 | 5a | **Livret A / compte rémunéré** ouvert ou rapatrié (fonds de travaux) | 2024 |
| B5 | 5a | **Banque à distance** : copro créée, droits, connexion bancaire eStale | 2024, 2014 |
| B6 | 5a | **Ancienne banque contactée** : prélèvements et virements du sortant arrêtés, solde et livret à rapatrier | 2024 |
| B7 | 7 Bascule | **Virement du sortant contrôlé** (= solde du compte d'attente), écart nommé sinon porté à l'AG | 2024, 2010 |
| K1 | 8a Communication | **Courrier / mail à tous les copropriétaires** : changement de syndic, présentation, **mandat de prélèvement SEPA**, fiche de renseignements, extranet | 2013 + demande Sekou |
| K2 | 8a | **Courrier / mail à tous les fournisseurs et prestataires** : changement de syndic, adresse de facturation, RIB, **accès extranet fournisseurs récupérés** | 2013 + demande Sekou |
| K3 | 8a | **Extraits de compte individuels + répartition N-1 envoyés** avec la mention « ne pas régler la répartition à l'ancien syndic, votre solde en tient compte » | 2024, 2014 |
| Z1 | 8a | **Assurance** : avenant de changement de syndic sur la multirisque, sinistres en cours repris | (absent des 4 docs) |
| G1 | 8 | **Contrats, PV, RCP, contrat de syndic scannés et classés** | 2013 |
| G2 | 8 | **Carnet d'entretien** alimenté depuis les contrats enregistrés | 2013 |
| G3 | 8 | **Registre national des copropriétés** mis à jour (changement de syndic) | 2024 |
| G4 | 8 | **Facturation des honoraires du cabinet** paramétrée (client SDC + RIB, Pennylane) | 2014 |
| X13 | 8 | **Comptes d'attente et copropriétaires partis soldés** en fin de reprise | 2024 |
| A1 | 8b Première AG | **Comptes de tout l'exercice repris** présentés et approuvés par le repreneur (période du sortant incluse) | Crypto 2010 |
| A2 | 8b | **Écart de reprise non justifiable** inscrit à l'ODJ (à la charge des copropriétaires) | Crypto 2010 |

Deux règles métier qui survivent à Crypto et méritent d'être écrites : « **les appels de fonds du
sortant ne se ressaisissent jamais ; on crée les budgets et on regénère — et on accepte les écarts,
on ne les modifie jamais** » (fiche éditeur 2010, cohérent avec X3) ; « **compteurs d'eau complétés
avant tout appel de fonds** » (2013).

Ce qui est périmé et ne se reprend pas : chemins de menus Crypto, journaux OD/BAS/AC/RE, compte
512900, cases TLMC, lettre-chèque, 401SDCXXX en gérance, et la méthode 2013 « factures du sortant
en OD à la date de clôture » (tout l'historique, jamais les soldes — C3).

---

## La checklist du module intranet

Les 89 lignes ci-dessus mêlent gestes humains et contrôles automatisés. **Le module `/reprise-copro`
n'en porte que les gestes humains : 44 étapes en 8 phases** (`ETAPES_REPRISE`,
`src/lib/reprise/domain/dossier.ts`), chacune avec un rôle par défaut (référent · gestionnaire ·
assistant · comptable), assignable à une personne, avec un statut « bloqué » motivé, et des étapes
ad hoc par dossier. Les contrôles chiffrés (E1–E10, I4–I6, N3…) restent au skill, qui les exécute.
