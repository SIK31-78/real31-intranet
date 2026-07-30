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
| Couche texte (pdfjs, en place) | par positions (nous) | n/a (exact) | ✅ | 0 € | **toujours en premier** |
| Rendu image + LLM vision | non garanti | ❌ | ❌ | tokens | ❌ recopie non refusable — le mode qui a produit la clé 300 |
| Mistral OCR (en place, markdown) | partielle | ❌ (pas par cellule) | ❌ en tableau | ~1 €/1000 p. | ⚠️ corruption prouvée sur tableaux denses (S0302) |
| Google Document AI | ✅ | ✅ | ✅ | ~1,5-30 €/1000 p. selon processeur | candidat |
| Azure Document Intelligence (layout) | ✅ | ✅ | ✅ | ~10 €/1000 p. | candidat |
| AWS Textract (tables) | ✅ | ✅ | ✅ | ~15 €/1000 p. | candidat |

Reco : **benchmark des trois candidats sur les scans réels de S0306** (RCP 1974, tableau
ascenseur à colonne coupée) avec un harnais unique : le moteur rend cellules + bbox +
confiance, NOTRE code reconstruit, applique le seuil de confiance, et l'oracle tranche.
Le choix final est un résultat de mesure, pas une opinion.

**Préalable au benchmark — sous-traitance PII (revue 30/07)** : envoyer les noms et
adresses de 44 copropriétaires réels à GCP, Azure ou AWS est une **sous-traitance RGPD**
— DPA à vérifier AVANT toute mesure. Le projet a déjà posé ce standard en traitant
`data/` comme de la PII gitignorée ; il vaut aussi pour les API. Un candidat sans DPA
acceptable est **disqualifié indépendamment de toute mesure** — à découvrir avant de
mesurer, pas après. À lever en parallèle : ça ne bloque rien d'autre que le benchmark.

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

Un tableau par configuration (couche texte seule · + OCR candidat A/B/C · avec/sans
petit modèle d'indexation). C'est ce protocole qui rend le choix OCR décidable.

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

### Le trou des noms (risque résiduel, chiffré)

Aucun des fixes ne détecte `VENDRAMBILI` pour VENDRAMELLI. Piste (celle exécutée à la
main) : confronter FDP (`totaux_tantiemes_par_owner`) × PV (`votants_avec_tantiemes`) —
quand les tantièmes concordent et que le patronyme diffère d'une distance d'édition ≤ 2,
coquille détectée sans meilleur OCR. Coût : **2-3 jours** (extraction des votes du PV =
un apport de plus dans l'indexeur ; l'appariement par score existe déjà dans
`mapping-compta`/`liaison-comptes`, à réutiliser tel quel). Le registre national reste un
contrôle manuel (pas d'API exploitable proprement). Reco : **oui, mais après** le
garde-fou arithmétique et l'indexation — c'est le seul filet possible sur les noms, et
il est bon marché parce qu'il recycle l'existant.

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
pas et n'a qu'une source ; un tableau scanné dont le total imprimé est lui-même illisible
(refus, donc intervention humaine — c'est voulu) ; et l'équivalence inter-syndics tant
qu'on n'a que deux lots de fixtures.
