# Étude — indexation par apports et décomposition de l'extraction patrimoine

> Suite du bug report S0306 (`docs/bug-report-extraction-S0306.md`) et de sa revue croisée.
> Commande : **une étude, pas de code**. Elle propose le modèle d'indexation des documents,
> la décomposition de l'extraction en tâches, la comparaison OCR sur le bon critère, une
> architecture cible, un protocole de mesure, et une recommandation chiffrée — avec ce
> qu'on ne saura PAS prouver. Rédigée le 2026-07-30, révisée le même jour après revue
> croisée (7 remarques, toutes intégrées — les corrections sont marquées « revue 30/07 »).

## 0. Constat vérifié en code (pas de procès d'intention)

| Affirmation du rapport | Vérifié |
|---|---|
| `pourStructure` contient `rgdd` (deux d), jamais « relevé général des dépenses » en clair | ✅ `orchestrateur-patrimoine.ts:182` |
| `estNomGrandLivre` ne reconnaît que « grand livre » et « GL » isolé | ✅ `limites-upload.ts:79-84` |
| Tout document qui ne matche ni l'un ni l'autre part en ANNEXE (1 appel IA chacun) | ✅ `analyser-dossier.ts:85` (`estAnnexe = !estGrandLivre && !estDocPatrimoine`) |
| La compta refuse les scans (couche texte only) | ✅ `router.ts:101-112` → `CoucheTexteComptaExtractionProvider` |
| `m\|mme` figure dans la liste fermée eStale ET sert au couple à patronymes différents | ✅ `prompts-extraction.ts:25-28` |

Conséquence mesurée sur S0306 : les deux RGD texte, le RGD scanné et la fiche de synthèse
sont partis en ANNEXE — le pipeline patrimoine ne les a jamais vus comme sources de clés,
et le pipeline compta ne les a jamais vus du tout.

---

## 1. Le modèle d'indexation : des APPORTS, pas des types

La question posée à chaque document cesse d'être « de quel type es-tu ? » pour devenir
« **qu'apportes-tu, et avec quelle fiabilité ?** ». Un document est indexé par un ensemble
d'apports ; un apport peut venir de plusieurs documents ; c'est voulu (la redondance est
une contre-preuve, pas un conflit).

### 1.1 Vocabulaire des apports (liste fermée, domaine pur)

| Id | Apport | Consommateur |
|---|---|---|
| `tantiemes_par_lot` | tableau de tantièmes par lot pour une clé | patrimoine (clés) |
| `lots_descriptif` | liste de lots avec usage/étage/bâtiment | patrimoine (lots) |
| `owners_adresses` | copropriétaires avec adresses | patrimoine (owners) |
| `totaux_tantiemes_par_owner` | « Nombre de tantièmes : X » par copropriétaire | contre-preuve attributions |
| `votants_avec_tantiemes` | votants du PV avec leurs voix | contre-preuve owners/homonymes |
| `ecritures_comptables` | lignes datées débit/crédit | compta (grand livre) |
| `tva_deductible_par_facture` | TVA + part déductible | compta bloc B (RGD) |
| `cles_utilisees_en_compta` | colonnes de répartition du RGD | périmètre des clés |
| `quotes_parts_450` | état de répartition par compte 450 avec tantièmes | liaison owners↔450 |
| `nb_lots_batiments` | compteurs de contrôle | contrôle (jamais source) |
| `appels_de_fonds_par_cle` | appels par clé | contrôle croisé clés |
| `aucun` | rien d'utile à la reprise | **ne pas analyser** (économie directe) |

Leçon S0306 gravée dans le modèle : la CONVOCATION (87 p.) porte `quotes_parts_450`
en pages 75-76, la FDP porte `tantiemes_par_lot` ET `totaux_tantiemes_par_owner`,
le RCP de 1974 ne porte que le périmètre des clés. Aucune taxonomie par type ne prédit ça.

### 1.2 Détection : contenu d'abord, nom de fichier en indice faible

Trois étages, du gratuit vers le payant, chacun ne s'exécutant que si le précédent ne
suffit pas :

1. **Heuristiques de contenu** (code pur, 0 token) : sur la couche texte des 1-3 premières
   pages et les en-têtes de tableaux détectés par positions — présence d'une colonne
   « tantièmes »/« millièmes », d'un plan de comptes (`^[1-7]\d{2}`), de dates d'écritures
   en série, des mentions « nombre de tantièmes », « pour : … tantièmes » (votes). Le nom
   de fichier ne sert qu'à départager, jamais à décider seul.
2. **Petit modèle bon marché** (1 appel court par document ambigu, sur extrait de ~2 pages) :
   rend la liste d'apports + les plages de pages. Sortie JSON contrainte, validée.
3. **Humain** : un document que ni 1 ni 2 ne classent reste `aucun` + note « à qualifier »
   — jamais envoyé en analyse lourde par défaut.

Le piège « EDD » (état **descriptif** de division vs état **détaillé** des dépenses) se
résout tout seul : les deux ont des contenus disjoints (lots/tantièmes vs comptes/montants),
c'est indécidable par le nom et trivial par le contenu.

### 1.3 Hiérarchie de fiabilité PAR DONNÉE (déclarée, testée)

Table de domaine pur — même geste que `DELAIS_CABINET` : des constantes lisibles,
ajustables sans relire la logique.

⚠️ **Correction de revue (30/07)** : la première version posait la FDP en « source
primaire » des tantièmes. C'était généraliser une circonstance de S0306 (la FDP y était
la seule source exploitable) en règle — et institutionnaliser les erreurs de saisie du
logiciel du syndic sortant en reléguant l'**acte** au rang de contrôle. La hiérarchie
distingue donc DEUX axes : la **source de droit** (ce qui fait foi) et la **source la
plus exploitable** (ce qu'on sait lire de façon fiable). Quand les deux divergent, c'est
une **note bloquante**, jamais un arbitrage silencieux. Cas concret S0306 : le RCP
annonce 39 caves, la FDP 38 — cet écart doit remonter à l'écran, pas disparaître dans
une préférence implicite.

| Donnée | Source de droit | Source la plus exploitable | Divergence |
|---|---|---|---|
| tantièmes charges générales | EDD/RCP (acte) | FDP (totaux imprimés) | **note bloquante** |
| périmètre d'une clé | RCP + modificatifs (actes) | RGD (colonnes utilisées) | **note bloquante** |
| clés utilisées en compta | — (réalité comptable) | RGD | RCP divergent → note |
| nb de lots / bâtiments | EDD | fiche synthèse | **note bloquante** (cf. 39/38 caves) |
| owners + adresses | — | FDP | registre national = contrôle manuel |
| appariement owners↔450 | — | état de répartition 450 | appariement par nom = repli, warnings |

### 1.4 Redondance = contre-preuve, doublons de forme = choix de la couche texte

- Deux documents portent la même donnée → on **confronte** ; un écart devient une note,
  jamais un choix silencieux. (C'est ce qui a tranché REDISSI : FDP + votes du PV.)
- Même document sous deux formes (`rgd.pdf` scanné vs `Releve-general-depenses-date.pdf`
  texte) → détection par similarité de contenu (totaux, période, nb de pages utiles) et
  **préférence systématique à la couche texte** : gratuit en fiabilité comme en coût.

### 1.5 Le contrôle miroir : couverture des apports REQUIS (revue 30/07)

Le vocabulaire fermé + le repli `aucun` ont un angle mort : un format de syndic inconnu
perdrait ses données avec une simple note. Le contrôle final porte donc sur la **donnée**,
pas sur le document : en fin d'indexation, chaque apport REQUIS doit être fourni par au
moins un document — sinon **bloquant**, quel que soit le nombre de documents bien indexés.

- **Requis patrimoine** : `tantiemes_par_lot`, `lots_descriptif`, `owners_adresses`.
- **Requis compta** : `ecritures_comptables`.
- **Souhaités** (absence = note, pas un blocage) : `totaux_tantiemes_par_owner`,
  `votants_avec_tantiemes`, `quotes_parts_450`, `nb_lots_batiments`.

Symétrique du refus actionnable (§3bis) et aussi bon marché : c'est une différence
d'ensembles, zéro token.

---

## 2. L'extraction décomposée en 6 tâches

| # | Tâche | Moteur | Volume/reprise (est.) | Coût/reprise (ordre de grandeur) |
|---|---|---|---|---|
| 1 | Indexer les apports | heuristiques ; petit modèle en repli sur les ambigus | ~15 docs, dont ~5 ambigus × 2 p. | ~0 € + qq centimes |
| 2 | Localiser pages/tableaux utiles | code (positions/en-têtes) ; modèle si échec | inclus dans 1 | ~0 € |
| 3 | Spec de format d'un tableau | gros modèle, 1 appel sur 2-3 pages échantillon | 3-6 tableaux | ~0,10-0,50 € |
| 4 | **Transcrire les cellules** | **code, jamais un modèle** | ~30-60 p. utiles | 0 € |
| 5 | Lire un tableau **sans couche texte** | OCR outillé (cf. §3) | 5-15 p. scannées | ~0,05-0,50 € selon moteur |
| 6 | Qualifier/normaliser (civilité, couples, dédup) | règles pures testées ; le modèle **propose**, ne fusionne **jamais** | qq dizaines de lignes | ~0-0,10 € |

Tâche 6, règle explicite (revue 30/07) : « modèle sur cas résiduels » était la porte par
laquelle REDISSI est passée. Le modèle peut *proposer* un rapprochement ; la **fusion est
un geste humain** dans l'éditeur de corrections, sans exception — même règle que la revue
de mapping compta (`appliquerDecisions`).

Lecture honnête : le coût API d'une reprise reste **inférieur à 1-2 €** dans toutes les
configurations raisonnables — **le coût n'est pas le critère de choix**, la *refusabilité*
l'est (§3). Le vrai gain de la décomposition est ailleurs : chaque tâche devient testable
seule, et 4 (la transcription) sort définitivement du modèle — c'est la cause directe des
tantièmes inventés (clé 300 : ~1 000 × 38 lots fabriqués sur un scan illisible).

⚠️ Les tarifs API évoluent vite : les ordres de grandeur ci-dessus sont à re-vérifier au
moment du choix, pas à graver.

---

## 3. OCR : le critère n'est pas « qui lit le mieux » mais « qui permet de REFUSER »

Deux exigences non négociables, faute de quoi rien ne distingue « lu » d'« inventé »
(c'est ce qui a coûté les −25,57 € en compta) :

- **confiance par cellule** → le code refuse au lieu de deviner ;
- **géométrie (bbox) par cellule** → le code reconstruit les colonnes, comme
  `parseur-grand-livre-positions`.

| Voie | Structure tableau | Confiance/cellule | Bbox | Ordre de prix | Verdict |
|---|---|---|---|---|---|
| Couche texte (pdfjs, en place) | par positions (nous) | n/a (exact) | oui | 0 EUR | **toujours en premier** |
| **Tesseract 5 (local)** | **inutile - on a le parseur** | oui, par token | oui | **0 EUR, aucun DPA** | **RETENU** (mesure ci-dessous) |
| Rendu image + LLM vision | non garanti | non | non | tokens | ecarte : recopie non refusable - le mode qui a produit la cle 300 |
| Mistral OCR (en place, markdown) | partielle | non (pas par cellule) | non en tableau | ~1 EUR/1000 p. | corruption prouvee sur tableaux denses (S0302) |
| Google Document AI | oui | oui | oui | ~1,5-30 EUR/1000 p. | plan B documente |
| Azure Document Intelligence (layout) | oui | oui | oui | ~10 EUR/1000 p. | plan B documente |
| AWS Textract (tables) | oui | oui | oui | ~15 EUR/1000 p. | plan B documente |

### Tesseract : le candidat qui manquait, et il suffit (mesures du 30/07)

Le tableau initial oubliait Tesseract, et cet oubli changeait la conclusion. Il est libre,
tourne **en local** (donc **aucune sous-traitance, aucun DPA**) et rend **confiance et bbox
par token** - exactement le critere de refusabilite.

**Mesures de reference, page redressee** (RCP 2.pdf p. 30, tableau ascenseur de 1975,
`--psm 6`, sortie `tsv`, Tesseract 5.4.0) :

| Rendu | cellules « 56 » lues | confiance moy. |
|---|---|---|
| 150 dpi, redressee | 37 / 50 | 89,3 |
| 200 dpi, redressee | 39 / 50 | 91,0 |
| **300 dpi, redressee** | **40 / 50** | **93,2** |
| 400 dpi, redressee | 41 / 50 | 91,5 |
| 300 dpi, **a l'envers** | **0 / 50** | 58,0 |

**300 dpi est le point de fonctionnement** : la courbe est plate entre 200 et 400, monter ne
gagne rien. Et **aucun upscaling** - le « pic » a x2 Lanczos releve dans une premiere mesure
etait du bruit sur une image renversee, pas un optimum. Le Lanczos ne fait pas partie de la
chaine.

Colonne des valeurs nette en x : le parseur par positions a de quoi reconstruire.

#### La lecon, et elle est plus dure que « figer la chaine »

Une premiere serie de mesures a rendu 20, 28 puis 22 cellules selon l'echelle. Ces trois
chiffres ne mesuraient RIEN : l'extraction avait perdu la metadonnee `/Rotate 180` du PDF, et
les images partaient **a l'envers** chez Tesseract. Ils ne mesuraient donc que la capacite du
moteur a survivre a une image renversee.

> **Un harnais qui perd une metadonnee de page produit un chiffre qui ne mesure rien.**
> La chaine doit d'abord etre CORRECTE, et sa correction doit etre PROUVEE - pas seulement
> figee.

Sans ce redressement, la conclusion aurait ete « Tesseract est inutilisable sur ce scan » et
on serait parti acheter un industriel pour resoudre un bug de trois lignes.

**Ampleur du phenomene** : `/Rotate 180` est sur **36 des 36 pages** de `RCP 2.pdf`. Ce n'est
pas une curiosite, c'est le cas normal des scans notaries. Et il se LIT, il ne se suppose
jamais : dans le meme lot, `RCP.pdf` n'a **aucun** `/Rotate` et la feuille de presence porte
`/Rotate 0`.

#### Le reflexe devient une assertion, pas une bonne pratique

Ce qui a sauve le diagnostic, c'est d'avoir vide le TEXTE BRUT au lieu de se fier au compteur
(« TIALYAV.L dd LibaVdda » lu a l'envers donne « TABLEAU DE REPARTITION »). Ce reflexe ne peut
pas dependre de la vigilance de celui qui lance la mesure : il est desormais code dans
`domain/orientation-page.ts` (8 tests), avec trois signaux du plus fiable au plus faible :

1. **les ancres** - un mot qu'on SAIT devoir figurer sur la page. Aucune ancre trouvee est le
   signal le plus sur, et il prime meme sur une confiance elevee (un moteur peut etre confiant
   sur du miroir) ;
2. **l'absence totale de numerique** sur une page censee porter un tableau de valeurs - le
   symptome exact observe (0 cellule sur 50) ;
3. **la confiance moyenne**, qui s'effondre de 93 a 58 quand l'image est renversee.

Garde-fou du garde-fou : une page trop pauvre (verso blanc, page de garde) ne conclut RIEN -
refuser a tort ferait redemander des pieces sans raison.

**Quatre raisons de ne pas prendre un industriel** :

1. l'oracle rend le moteur secondaire - 40 x 56 = 2 240 != 2 800 -> **refus**, comportement
   voulu, obtenu sans cle ni contrat ;
2. **on paierait la brique deja ecrite** : Document AI, Azure DI et Textract vendent la
   reconstruction de structure de tableau, or `parseur-grand-livre-positions` et
   `parseur-tantiemes-positions` la font. Ce qu'on veut d'un OCR, c'est du brut avec
   geometrie et confiance ;
3. **le vrai levier est en amont** : la FDP est l'impression d'une sortie logicielle - la
   donnee etait numerique trente secondes avant d'etre scannee. Le message de refus doit
   d'abord reclamer l'**export natif**. Un export obtenu, c'est zero OCR ;
4. le cout reel n'est pas le prix mais un DPA, un fournisseur de plus, une cle a faire
   tourner et une dependance externe sur un chemin critique - pour deux pages par reprise.

#### Rasteriseur : pdfjs + @napi-rs/canvas, et pas poppler

- `pdfjs-dist` est **deja dans la stack** pour la couche texte, et son piege Next.js est deja
  regle (`serverExternalPackages`) : on ne reintroduit rien.
- Poppler est plus rapide mais c'est un **binaire systeme** : impossible de le garantir
  identique en local, en CI et en production. La rastérisation n'est de toute facon pas le
  goulot, l'OCR l'est.
- Pour le canvas : **`@napi-rs/canvas`** plutot que `node-canvas` - binaires precompiles, pas
  de compilation cairo a reproduire sur trois environnements.
- **Obligation de contrat** (portee par `ports/ocr-provider.ts`) :
  `page.getViewport({ scale, rotation: page.rotate })`. Le port expose
  `rotationAppliquee` pour que la correction de la chaine soit PROUVABLE, et son test
  d'acceptation tient en une ligne - OCRiser RCP 2.pdf p. 30 et verifier que le premier mot
  lu est « TABLEAU », pas son miroir.

#### A trancher AVANT de coder, dans cet ordre

1. **Ou tourne ce chemin ?** Le mur Vercel (~4,5 Mo de body, duree des functions) est deja
   documente. Rasteriser 28 pages en 300 dpi puis les OCRiser, c'est de la memoire et du temps
   que le serverless ne donnera pas. Decider **d'abord** worker local ou tache de fond,
   **ensuite** le rasteriseur - sinon on choisit pdfjs pour de bonnes raisons et on decouvre
   qu'il ne tourne pas la ou on l'a mis.
2. **Le viewport honore `/Rotate`**, verifie par un test, pas par une relecture de code.

**Installation** : Tesseract 5.4.0 est present sur le poste (`C:\Program Files\Tesseract-OCR`),
pack `eng` seul - suffisant pour des chiffres. Sur le serveur, prevoir **`tesseract-ocr-fra`**
pour les libelles de lots et les patronymes.

Reco initiale (revue et remplacee, cf. ci-dessus) : benchmark des trois industriels sur les scans reels de S0306 (RCP 1974, tableau
ascenseur à colonne coupée) avec un harnais unique : le moteur rend cellules + bbox +
confiance, NOTRE code reconstruit, applique le seuil de confiance, et l'oracle tranche.
Le choix final est un résultat de mesure, pas une opinion.

**Sous-traitance PII — le DPA bloque la PRODUCTION, pas la MESURE (précisé le 30/07)**.
Première formulation trop large : elle faisait du DPA un préalable au benchmark, et retardait
la décision OCR pour rien. Ce que le benchmark mesure, c'est la lecture d'un **tableau de
tantièmes** — soit `n° de lot | valeur`, **aucune donnée personnelle**.

- **Benchmark : PII-free par nature.** Pages de test idéales sur S0306 : `RCP 2.pdf` p. 30-31,
  le tableau de répartition ascenseur (colonnes Niveau / Bâtiment / Nature du lot /
  Quote-part). Zéro nom, et c'est justement le cas difficile — scan de 1975, colonne coupée au
  bord de page. **Seul soin à prendre : extraire les pages, ne jamais envoyer le PDF entier**
  (le corps du RCP contient les noms des parties de 1974).
- **Production : DPA requis.** Le passage en réel touche la FDP, qui porte les noms et les
  adresses. Là, un candidat sans DPA acceptable est **disqualifié indépendamment de toute
  mesure**. À lever en parallèle du benchmark, pas avant.

**L'oracle scan** : Σ(tantièmes) = total annoncé, sinon **refus** (clé émise avec 0
tantième + note bloquante « tableau illisible, fournir la page N ou un export », cas dédié
dans `prochaine-etape`). N'importe quel OCR devient utilisable dès lors que le code refuse
ce qui ne boucle pas — la question se déplace de « quelle IA » vers « quel harnais ».

**Divergence assumée avec la compta** : la compta refuse les scans (un syndic sort
toujours un grand livre natif) ; le patrimoine DOIT avoir un chemin scan (RCP 1974), donc
un chemin plus lent et plus cher par nature. Le gain compta (6 min → 2 s) **ne se
transposera pas mécaniquement** — écrit ici pour qu'on ne le promette à personne.

### 3bis. Le refus actionnable : « demander la pièce manquante » est CALCULABLE (revue 30/07)

La raison n°1 du succès de la reprise manuelle — la boucle « constater le trou, demander
la pièce, boucler » — ne peut pas rester une note vague. L'écart est calculable : comparer
les **plages de lots couvertes** par un tableau de tantièmes à la liste des lots connus
donne littéralement « il manque les lots 51-66 et 201-506 » — donc « il manque la page 2
du tableau ascenseur ». C'est CE message qui a permis de boucler la clé à 10 000.

Conception :

- l'objet de refus porte les **plages manquantes** (lots absents, total partiel constaté
  vs total annoncé) et la **source ciblée** (document, pages) — pas un booléen ;
- `prochaine-etape` gagne un cas dédié dont le message **est la demande à l'ancien
  syndic** (« fournir la page N du tableau X, ou un export »), copiable tel quel dans un
  mail ;
- même mécanique pour un total illisible : « total attendu illisible, page N » ;
- un refus actionnable vaut dix refus vagues : c'est le critère d'acceptation de tout
  chemin de refus ajouté par ce chantier.

---

## 4. Architecture cible (remplace le provider monolithique)

```
ports/
  indexeur-documents.ts        (doc) -> { apports[], pages, forme: texte|scan, doublonDe? }
  extraction-tableau.ts        (pages, spec) -> cellules[] { valeur, bbox, confiance }
  spec-format-provider.ts      (échantillon) -> spec colonnes    [existant compta, généralisé]
adapters/
  indexation/ (heuristiques pures + petit-modele en repli)
  tableau/couche-texte (pdfjs, en place) · tableau/ocr-<retenu> (scans)
domain/
  apports.ts (vocabulaire fermé + hiérarchie de fiabilité + confrontation redondance)
  civilite.ts (fonction pure, cf. §6)
services/
  indexer-dossier.ts -> plan d'analyse (qui lit quoi, ce qu'on ignore, doublons)
  extraire-patrimoine.ts (orchestre 1→6, garde-fous DANS l'extraction)
```

Inchangé : dry-run par défaut, gate `ESTALE_ECRITURE=reel` + GO/STOP, auto-checks en
aval (ils ont fait leur travail sur S0306 — on ajoute des refus en amont, on ne les
remplace pas).

---

## 5. Protocole de mesure (fixtures S0306 + S0302, multi-syndics obligatoire)

Étape 0 du chantier : figer les fixtures — en **deux étages** (revue 30/07), parce qu'une
fixture dont les entrées sont gitignorées n'est pas un test de régression : `.gitignore`
exclut `data/**/*.pdf` à raison (le lot S0306 pèse 28 Mo et porte les noms et adresses de
44 personnes réelles), donc pas de CI, pas de reproductibilité, et dans six mois plus
personne n'a les PDF.

- **Étage PDF** (`data/`, gitignoré) : les sources brutes, réservées au **benchmark OCR**
  — lui seul a besoin des pixels. Pas de CI possible sur cet étage, et c'est assumé.
- **Étage JSON anonymisé, COMMITÉ** : le jeu intermédiaire post-transcription, test de
  régression de tout l'aval (indexation, clés, dédup, attributions, contre-preuves). Les
  pseudonymes **conservent les propriétés qui font le test** : deux homonymes stricts à
  la même adresse, deux homonymes à adresses différentes (le cas GOUGE), un prénom
  composé (le cas BARDON), trois personnes morales sans gérant, et une paire à distance
  d'édition 2 (le filet noms).

S0306 (REACT) = jeu prouvé — 118 lots, clés bouclant à 100 000 et 10 000, 44 owners,
118 attributions, 0 orphelin. S0302 = référence compta déjà bouclée (écart 0,00). Un lot
d'un 3e syndic dès qu'une reprise en fournit un.

| Métrique | S0306 attendu |
|---|---|
| documents correctement indexés (apports) | 14/14 ; RGD → `tva_deductible_par_facture` (compta) **ET** `cles_utilisees_en_compta` (patrimoine) — deux consommateurs, cf. §1 ; fiche synthèse → contrôle |
| couverture des apports requis (§1.5) | 100 % — aucun requis absent sans blocage |
| refus actionnables (§3bis) | plages manquantes exactes (« lots 51-66, 201-506 ») |
| doublons de forme détectés | `rgd.pdf` ≡ `Releve-general-depenses-date 2025.pdf`, texte préféré |
| clés extraites / bouclées | 2/2 à 100 000 et 10 000 (plus jamais 6 dont 4 fausses) |
| exactitude numéros de lots | 118 attributions, 0 orphelin (plus de lot « 204 » fantôme) |
| owners | 44 (les deux REDISSI distinctes) |
| exactitude des noms | mesurée contre le jeu prouvé — **seule métrique sans garde-fou automatique** |
| coût / latence par configuration | tableau comparatif par run |

Un tableau par configuration (couche texte seule, + Tesseract, avec/sans petit modele
d'indexation). C'est ce protocole qui rend le choix OCR decidable.

**Deux exigences ajoutees le 30/07, sans lesquelles le protocole ne mesure rien :**

1. **La chaine doit etre CORRECTE avant d'etre figee, et sa correction doit etre PROUVEE.**
   Un harnais qui perd une metadonnee de page produit un chiffre qui ne mesure rien : une
   premiere serie a rendu 20/28/22 cellules avant qu'on decouvre que les images partaient a
   l'envers (`/Rotate 180` perdu). Donc (a) l'assertion d'orientation
   (`domain/orientation-page.ts`) tourne sur CHAQUE page mesuree et un verdict « suspecte »
   INVALIDE la mesure ; (b) le port expose `rotationAppliquee`, qu'on releve dans le tableau
   de resultats ; (c) alors seulement on fige et versionne la chaine (300 dpi, `--psm 6`,
   aucun upscaling).
2. **L'oracle du PDF de benchmark est un REFUS, pas un bouclage.**
   `data/S0306/benchmark-ocr/RCP2_p30-31_tableau_ascenseur.pdf` ne porte que la **premiere
   page** du tableau - la page 2 n'existe dans **aucun** document du lot. Attendu : motif
   `tableau_incomplet`, lots 1-50 couverts, somme = 2 800 / 10 000, plages manquantes 51-66,
   201-208, 301-308, 401-408, 501-506. **Ne jamais attendre 10 000 depuis cette entree** :
   payer un moteur pour mieux lire une page qui ne peut pas fermer, c'est acheter de la
   precision inutile.

L'oracle complet (les 96 lots qui bouclent a 10 000) est commite, PII-free, dans
`data/samples/S0306/oracle-cle-200.json` - numeros de lots et valeurs seulement. Il porte une
**reserve explicite** : le lot 305 = 195 est **deduit, non lu** (le scan est illisible sur
cette ligne). Deux justifications independantes - c'est la seule valeur qui fait boucler le
bloc 301-308 a 1 556, et elle suit le +1 systematique des paires de l'escalier B, verifie sur
(301,306), (302,307), (303,308) et (304,305). **Consequence pour le harnais** : si un moteur
rend 194 avec une confiance haute, ce n'est pas forcement lui qui a tort - la cellule part en
**arbitrage humain**, jamais en faux positif du moteur. Une valeur deduite ne peut pas servir
a condamner une lecture.

---

## 6. Les deux arbitrages demandés

### Civilité (fonction pure `domain/civilite.ts`, une seule règle)

Collision confirmée : dans la liste fermée eStale, `m|mme` = « Monsieur OU Madame »
(une personne, civilité inconnue) — et le prompt l'utilise aussi pour le couple à
patronymes différents (`prompts-extraction.ts:28`). Détournement réel. Trois options,
**à arbitrer avec la comptable** :

1. `m&mme` avec les deux patronymes (« BOURGEOIS / ESTEVE ») — cohérent avec le couple
   même-patronyme, mais « M. et Mme » sur deux noms différents est approximatif ;
2. `indivision` si déclarée — juste juridiquement, mais sur-déclare des couples simples ;
3. garder `m|mme` en convention interne assumée — zéro migration, ambiguïté documentée.

Dans les trois cas : « BARDON Jean & Michel » → un prénom composé sans « et » explicite
entre deux personnes reste UN prénom (« Jean Michel »), jamais un couple. La fonction
pure encode ça, le prompt et le skill en dérivent.

### Le trou des noms : un TAUX, plus un « risque résiduel » (mesuré le 30/07)

Aucun contrôle arithmétique ne détecte `VENDRAMBILI` pour VENDRAMELLI — une coquille ne
change aucun chiffre. La seule défense sans meilleur OCR est une **deuxième source** : FDP
(`totaux_tantiemes_par_owner`) × PV (`votants_avec_tantiemes`), avec appariement **non ambigu
des deux côtés**. Cette exigence transforme la formule vague en mesure :

| Sur le lot de référence S0306 | |
|---|---|
| owners à total **unique** → couverts par le filet | **31 / 44 (70 %)** |
| owners à total **partagé** → hors du critère « tantièmes » seul | **13** |

Totaux partagés : **153** (6 owners — un parking standard), **1503** (3), **1404** (2),
**2532** (2). Les deux homonymes de la fixture, eux, sont à 2 459 et 1 998 : appariement
licite.

**Deux conséquences, à la place de « risque résiduel »** :

1. le taux se **recalcule par copro** (`couvertureFilet`, deux lignes) et doit être
   **affiché dans le récap** : il dit honnêtement jusqu'où va la garantie ;
2. les owners à total partagé ne seront **jamais** couverts par cette route. Pour eux, une
   **deuxième clé d'appariement** : les **lots détenus**. Les 6 owners à 153 tantièmes
   détiennent chacun un parking différent — le numéro de lot les départage là où le total
   échoue. Même geste que la liaison 450, et la donnée est déjà là. *(Implémenté à l'étape 7.)*

Précaution de seuil : la distance est **échelonnée sur la longueur** du patronyme (≤1 sous
6 caractères, ≤2 au-delà). Sur un nom de 5 lettres, un seuil de 2 est presque un joker —
IZARD est à distance 1 de IZARI, mais aussi de IZART, ISARD et AZARD, qui peuvent être trois
personnes réelles.

Le registre national reste un contrôle **manuel** (pas d'API exploitable proprement).

## 7. Recommandation et limites

Ordre confirmé (révisé après revue) : **0** fixtures deux étages (PDF gitignorés pour le
benchmark, JSON anonymisé commité pour la régression) → **1** garde-fou arithmétique +
refus actionnable (§3bis) → **2** indexation par apports + contrôle de couverture (§1.5)
→ **3** prompt clés → **4** contre-preuve Σ tantièmes/owner → **5** dedup + R6 (le modèle
propose, l'humain fusionne ; seul le prompt récupère REDISSI) → **6** couche texte +
chemin scan patrimoine (benchmark OCR, après levée du préalable DPA) → **7** filet noms
(FDP × PV). **En parallèle, ne bloque que le benchmark** : vérification DPA des candidats
OCR (§3).

**Ce qu'on ne saura pas prouver, même après tout ça** : l'exactitude d'un nom qui ne vote
pas, n'a qu'une source, ET partage son total sans lots discriminants ; un tableau scanné dont
le total imprimé est lui-même illisible (refus, donc intervention humaine — c'est voulu) ; et
l'équivalence inter-syndics tant qu'on n'a que deux lots de fixtures.

**Les blocages du benchmark sont leves (30/07)** : les 14 PDF sont deposes dans
`data/S0306/` (27 Mo, gitignores) avec l'extrait PII-free des pages de tableau, et la cle
cloud s'avere **inutile** - Tesseract tourne en local et satisfait le critere de
refusabilite (cf. §3). La ligne « OCR cloud » devient un **plan B documente qu'on n'active
jamais** ; l'etape 6 est debloquee sans attendre le juridique.
