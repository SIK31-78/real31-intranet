# État du chantier extraction — arrêt du 2026-07-31

> **⚰️ CHANTIER CLOS PAR LA REFONTE DU 2026-08-24 (branche `chantier/reprise-v2`).**
> L'extraction IA du patrimoine a été SUPPRIMÉE du repo : le gestionnaire verse désormais les
> fichiers Excel produits par le skill `estale-migration`, le module les parse et les valide
> (déterministe). Les briques listées ici (indexation/apports, garde-extraction, orientation,
> OCR, contre-preuves, filet noms) ont été retirées avec elle — git garde l'historique si le
> sujet rouvre un jour. Ce document reste comme mémoire des impasses et des mesures.

> **Ce document porte l'ÉTAT. Le raisonnement et les choix sont dans
> [`etat de l'art → docs/etude-indexation-extraction-patrimoine.md`](./etude-indexation-extraction-patrimoine.md).**
> Une seule source par sujet : ici le « où on en est », là-bas le « pourquoi ». Si les deux se
> contredisent un jour, c'est que quelqu'un a dupliqué au lieu de renvoyer.
>
> Point de départ historique : [`docs/bug-report-extraction-S0306.md`](./bug-report-extraction-S0306.md).
>
> **À qui s'adresse ce document** : à quelqu'un qui n'a rien suivi et doit reprendre le chantier.
> Tout ce qui a coûté cher à établir est ici, y compris les impasses — surtout les impasses.

---

## 1. Décisions arrêtées

| Décision | Ce qu'elle ferme |
|---|---|
| **Full local, pas de phase 2** — calcul local, base Supabase | Plus de débat « worker ou tâche de fond » ; le module ne cible pas Vercel, donc plus de mur à 4,5 Mo ni de timeout de fonction |
| **Chaîne tout-npm** — `pdfjs-dist` + `@napi-rs/canvas` + `tesseract.js` | Plus de binaire système à installer et à reproduire sur N postes ; la chaîne voyage avec l'app |
| **DPA et OCR industriels hors périmètre** | Les identités ne quittent jamais le cabinet ; Document AI / Azure DI / Textract ne sont même plus un plan B |
| **Toutes les écritures, jamais les soldes** (compta) | Décision Sekou, non négociable ; c'est elle qui rend les filets arithmétiques possibles |
| **L'IA ne transcrit ni ne structure les chiffres** | La transcription est du code. La structuration doit le devenir (§3) |
| **Le modèle propose, ne fusionne jamais** | Une fusion faite à l'extraction est irrécupérable : personne ne peut deviner qu'une personne manque |

---

## 2. Construit et vérifié

| Brique | Où | Verrou |
|---|---|---|
| Indexation par apports (18 apports, liste fermée) | `domain/apports.ts`, `domain/indexation-documents.ts` | 12 tests |
| Contrôle miroir : couverture des apports **requis** | `domain/apports.ts` | inclus |
| Garde-fou arithmétique, **6 motifs de refus** | `domain/garde-extraction.ts` | 17 tests |
| Refus **actionnable** (plages manquantes calculées) | idem + `domain/prochaine-etape.ts` | inclus |
| Détection d'orientation, **4 signaux** + décision OSD seuillée | `domain/orientation-page.ts` | 16 tests |
| Adapter OCR avec **provenance de chaîne** | `adapters/ocr/tesseract-ocr-provider.ts` | 4 tests d'acceptation (smoke) |
| Pont OCR → positions, avec **inversion d'axes** | `adapters/shared/ocr-vers-page-texte.ts` | — |
| Contre-preuve Σ tantièmes/owner + anomalies d'attribution | `domain/contre-preuve-owners.ts` | 8 tests |
| Dédup par **lots / adresse / civilité** | `domain/dedup.ts` | 5 tests |
| Filet noms (Damerau, seuil échelonné, clé lots) | `domain/filet-noms.ts` | 18 tests |
| Fixture S0306 **deux étages** | `data/samples/S0306/`, `domain/__tests__/fixture-s0306.test.ts` | 11 tests |

Deux détails qui ont coûté du temps et qu'on ne veut pas repayer :

- le **6ᵉ motif de refus** distingue l'excédent ordinaire (valeurs fabriquées) de l'**excédent par
  facteur d'échelle** ×10/×100 (mauvaise colonne lue). Le message diffère : dans le second cas on
  ne demande **aucune page**, on fait revérifier la colonne ;
- le **pont OCR → positions** inverse l'axe vertical. L'OCR a son origine en haut à gauche, pdfjs
  en bas à gauche, et les parseurs raisonnent en repère PDF. Sans l'inversion, le parseur lit le
  tableau à l'envers et ne garde que ce qui est *au-dessus* de l'en-tête, c'est-à-dire rien.

---

## 3. Construit mais INERTE — le piège où l'on retombera

> C'est la section à lire en premier dans trois mois.

**Le découpage par tâche n'est pas fait.** Le provider d'extraction reste unique : il OCRise, puis
envoie **tout le markdown OCR dans un seul appel de structuration**. Conséquence directe : **un
modèle transforme encore des tokens OCR en tantièmes.** La règle « l'IA ne transcrit pas » a été
déplacée d'un cran, pas appliquée.

Preuve chiffrée, et elle est sans appel : la clé 200 est sortie à **11 067**, alors que le maximum
lisible depuis les documents fournis est **2 800** — la page 2 du tableau ascenseur n'existe dans
aucun PDF du lot. *Un nombre qui ne peut pas venir du document vient du modèle.*

Sont donc branchés mais **sans effet utile tant que §4 n'est pas levé** :

- le **pont OCR → positions** : construit, testé mécaniquement, jamais appelé en production ;
- le **parseur de tantièmes par positions** : idem ;
- la **contre-preuve par owner** : elle tourne, mais compare aux sommes *calculées*, nulles après
  refus des clés — elle produit donc 23 messages « 0 au lieu de 9 615 » qui noient le vrai signal.
  Le correctif est identifié (§7-2) : comparer aux **totaux imprimés**, pas aux sommes calculées.

Contournement encore en place, à retirer avec le découpage : `MISTRAL_TIMEOUT_MS` relevé à 600 s
pour qu'un lot complet passe. La rustine disparaît quand les appels seront découpés.

---

## 4. Bloqué, et sur quoi exactement

**La transcription déterministe des tantièmes depuis un scan**, bloquée sur **la détection de
colonnes**.

La voie par **en-têtes imprimés** — celle qui marche en compta, où la couche texte native rend
`Débit` et `Crédit` exactement — **ne transpose pas au scan**. Mesuré sur `RCP 2.pdf` p. 30 :

```
y=3429 : TABLEAU@518
y=3433 : DE@717   PEPARTIT@792          <- "RÉPARTITION" mangé ET coupé sur deux lignes
y=3416 : ON@1015  DES@1094  CHARCES@1209
y=3423 : SCENSEUK@1388
y=3217 : ou@517  Bâtiment@714  NATURE@1192  DU@1368  LOT@1446
```

Trois défaillances distinctes, toutes visibles ci-dessus :

1. l'OCR **mange** les mots (`PEPARTIT`, `CHARCES`, `SCENSEUK`) ;
2. il les **coupe** entre deux lignes (`PEPARTIT` / `ON`) ;
3. et surtout, **ce document n'imprime ni « tantième » ni « quote-part »** : la ligne d'en-tête
   réelle est `Niveau ou Bâtiment | NATURE DU LOT | …`. On cherchait un vocabulaire absent.

**Voie retenue : la géométrie seule.** Détecter la colonne des tantièmes par le **regroupement en
x** des tokens numériques — les 43 cellules « 56 » mesurées sont alignées à x ≈ 1702, signal net et
indépendant de tout mot.

Avec deux discriminants, parce que la géométrie seule peut choisir la mauvaise colonne (une page
porte aussi surface, étage, numéro) :

- **le bouclage arithmétique comme sélecteur** : la bonne colonne est celle dont la somme tombe sur
  le total annoncé ;
- **l'appartenance à la liste des lots** comme second discriminant : la colonne des numéros de lot
  est celle dont les valeurs sont toutes des numéros connus de l'EDD.

⚠️ Limite à assumer : le bouclage dit *qu'une* colonne est bonne, pas *laquelle* était censée
l'être. Sur un tableau où deux colonnes bouclent par coïncidence, il faudra un arbitrage humain.

---

## 5. Mesures — la partie la plus chère à refaire

### 5.1 Comparatif S0306 de bout en bout (2026-07-30, 174 s, `EXTRACTION_PROVIDER=mistral`)

| | obtenu | attendu | |
|---|---|---|---|
| lots | **118** | 118 | ✅ |
| clés | **2** | 2 | ✅ |
| clé 001 (somme) | 0 — *refusée, lue à 99 997* | 100 000 | ❌ |
| clé 200 (somme) | 0 — *refusée, lue à 11 067* | 10 000 | ❌ |
| copropriétaires | 46 | 44 | ❌ |
| attributions | 120 | 118 | ❌ |
| lots orphelins | 4 | 0 | ❌ |
| erreurs bloquantes | 131 | 0 | ❌ |
| documents indexés | **14/14**, couverture requis complète | 14 | ✅ |

**Aucune donnée fausse livrée** : les deux clés sont à 0 parce que le garde-fou a **refusé** de les
émettre. C'est le comportement voulu. À comparer au premier essai : 6 clés dont 4 fausses, dont une
sommant 38 000 pour 10 000 attendus.

Deux lectures qui orientent la suite :

- **99 997 / 100 000** : trois unités d'écart sur 118 lots — une ou deux cellules mal lues,
  l'extraction est *juste*. C'est le refus qui est trop grossier (§7-4) ;
- **11 067 / 10 000** : impossible depuis la source (max lisible 2 800). C'est le modèle (§3).

**Piste non vérifiée sur les 46 copropriétaires** : le RCP de 1974 *nomme ses parties* — un couple
et une SCI. Deux entités, et il en sort exactement deux de trop. À vérifier avant de chercher
ailleurs.

### 5.2 Rendements OCR, page redressée (`RCP 2.pdf` p. 30, `--psm 6`, tesseract.js 7.0.0)

| Rendu | cellules « 56 » | confiance moy. |
|---|---|---|
| 150 dpi | 37 / 50 | 89,3 |
| 200 dpi | 39 / 50 | 91,0 |
| **300 dpi** | **40 / 50** | **93,2** |
| 400 dpi | 41 / 50 | 91,5 |
| 300 dpi, **à l'envers** | **0 / 50** | 58,0 |

**300 dpi est le point de fonctionnement** (courbe plate 200-400), **aucun upscaling**.

### 5.3 Vitesse et modèles

- **457 ms** (tesseract.js, worker réutilisé) contre **397 ms** (binaire système) par page :
  **1,15×**, pas les 2 à 5× redoutés.
- Tailles de `.traineddata`, qui rendent deux mesures « Tesseract » **incomparables** :

| | binaire système | tesseract.js |
|---|---|---|
| `eng` | 4 113 088 o | 5 199 098 o |
| `fra` | 14 213 351 o | 1 248 107 o |

### 5.4 OSD — angles et confiances

| Page | `/Rotate` | angle OSD | conf. | réalité |
|---|---|---|---|---|
| RCP 2 p30 redressée | 180 honoré | 0 | 11,2 | droite ✓ |
| RCP 2 p30 métadonnée perdue | — | 180 | 11,5 | à l'envers ✓ |
| CONVOC p15 redressée | 90 honoré | 0 | 18,8 | droite ✓ |
| CONVOC p15 métadonnée perdue | — | 90 | 15,1 | tournée ✓ |
| **RCP.pdf p1** | absent | **180** | **0,04** | **droite — FAUX POSITIF** |
| RCP.pdf p6 | absent | 0 | 5,02 | droite ✓ |
| RCP.pdf p14 | absent | 0 | 7,63 | droite ✓ |

Seuil retenu : **3**, sous le plancher des verdicts justes (5,02), très au-dessus du faux positif.

### 5.5 Distribution de `/Rotate` — elle se lit PAR PAGE

| Fichier | `/Rotate` |
|---|---|
| `RCP.pdf` | **absent** sur 28 pages |
| `RCP 2.pdf` | 180 sur 36 pages |
| `Feuille de présence - 2026.pdf` | 0 sur 5 pages |
| **`CONVOCATION_AG_654464_139.pdf`** | **absent ×36, 0 ×43, 90 ×8** |
| `rgd.pdf` | 0 sur 6 pages |

### 5.6 Vraisemblance de page — calibrage MESURÉ

| Page | vérité | conf. moy. | long. moy. | numériques |
|---|---|---|---|---|
| RCP 2 p30 rendue correctement | **bonne** | **47,3** | **1,67** | 60 |
| CONVOC p15 (90° honoré) | **bonne** | **16,5** | 2,52 | **0** |
| Feuille de présence p1 | bonne | 72,1 | 3,95 | 87 |
| rgd p1 | bonne | 91,9 | 5,60 | 57 |
| RCP 2 p30 non redressée | mauvaise | 35,9 | 1,71 | 34 |

**Conséquence** : la confiance **ne sépare pas** le bon du mauvais sur la même page (47,3 vs 35,9).
Seule l'**ancre** est un signal bloquant fiable. Les seuils de confiance et de longueur de token,
calibrés sur des valeurs synthétiques (93 vs 58), refusaient des pages saines — ils ont été
rétrogradés en indicateurs.

### 5.7 Colonnes et tokens rejetés

- colonne des « 56 » : **x ≈ 1682-1704** sur 1888 px — nette et exploitable ;
- `RCP 2.pdf` p. 30 : **125 tokens rejetés sur 329** sous le seuil de confiance (un tiers) ;
  p. 31 : 32 sur 305.

### 5.8 Volume envoyé aux agents après indexation

3 documents pour l'agent structure, 5 pour l'agent propriétaires — au lieu de 14. C'est
l'indexation qui produit cette réduction.

---

## 6. Règles apprises, valables au-delà de ce chantier

1. **Un harnais qui perd une métadonnée de page produit un chiffre qui ne mesure rien.** La chaîne
   doit d'abord être *correcte*, et sa correction doit être *prouvée* — pas seulement figée.
2. **Une page sans métadonnée n'est pas une page droite : c'est une page dont on ne sait rien.**
3. **Une confiance OSD basse est un signal, pas du bruit** — typiquement une page à orientations
   mixtes (couverture notariée avec mention manuscrite verticale). Verdict : arbitrage humain, pas
   « on ne sait pas ».
4. **Deux mesures étiquetées « Tesseract » restent incomparables sans le modèle de langue.**
   « Tesseract » n'est pas un moteur, c'est une famille.
5. **Aucun repli ne doit être silencieux** — ni le mock, ni le routage par nom de fichier, ni un
   doublon écarté. Un repli muet est une dette qui ne se rappelle jamais à vous.
6. **Calibrer sur des valeurs synthétiques ne survit pas au réel.** Deux seuils sur trois sont
   tombés à la première confrontation aux vrais scans.
7. **Refuser à tort a un coût métier** : redemander une pièce inexistante à l'ancien syndic brûle du
   crédit auprès de quelqu'un déjà réticent. Un refus doit dire *quoi* demander, ou se taire.
8. **Vérifier ce que l'OCR a lu avant de compter.** Le compteur ne distingue pas « rien trouvé » de
   « tout lu à l'envers » ; le texte brut, si.

---

## 7. Ce qui reste, dans l'ordre

| # | Chantier | Estimation | Note |
|---|---|---|---|
| 1 | **Découpage par tâche** — sortir la structuration du modèle | 3-5 j | Bloque tout le reste : les autres se mesurent sur des chiffres qui ne veulent rien dire tant qu'un modèle structure |
| 2 | **Détection géométrique des colonnes** (§4) | 2-3 j | Bouclage en sélecteur, appartenance à la liste des lots en second discriminant |
| 3 | **Contre-preuve contre les totaux imprimés** | 0,5 j | Comparer aux totaux de la FDP, pas aux sommes calculées. C'est elle qui localisera les 3 unités |
| 4 | **Refus ciblé** sur les lignes désignées par 3 | 1 j | Aujourd'hui binaire : à 3/100 000 près, il jette 117 lots justes |
| 5 | **Sur-détection d'apports** | 1 j | `RCP.pdf` sort avec `tantiemes_par_lot` qu'il n'a pas ; `owners-list` n'est jamais écarté (0 document sur 14 exerce le « droit de ne rien analyser ») |
| 6 | **Faux doublon + visibilité** | 0,5 j | `Annexes 2026` marqué doublon de `Annexes 2025` : la signature est dominée par le millésime et les comparatifs N/N−1 citent les deux. Se caler sur la **période déclarée**. Et **tout doublon écarté doit apparaître au récap avec son jumeau** — un document silencieusement perdu est le pire mode de défaillance |
| 7 | **Mock silencieux sous test** | 0,25 j | Le garde `NODE_ENV=production` existe : l'étendre à tout contexte de mesure. Un harnais qui mesure le mock produit un chiffre qui ne mesure rien |

### Questions encore ouvertes

- **Convention de civilité** — collision réelle : dans la liste fermée eStale, `m|mme` signifie
  « Monsieur **ou** Madame » (une personne de civilité inconnue), et le prompt l'utilise aussi pour
  un couple à deux patronymes. Trois options posées dans l'étude ; **décision de la comptable**.
- **Second lot d'un autre syndic** — la fixture ne contient que S0306 (REACT) et S0302. Tant qu'il
  n'y a pas de troisième format, l'équivalence inter-syndics n'est pas prouvable.
- **Filet noms** — couvre 31 owners sur 44 (70 %) sur le lot de référence ; les 13 autres partagent
  leur total de tantièmes et dépendent du second discriminant par les lots.

### Harnais de mesure à reconstruire

Les deux smokes qui ont produit §5.1 et §5.7 ont été retirés de l'arbre (c'était de
l'échafaudage, pas des tests). Pour relancer :

- **comparatif de bout en bout** : lire `data/S0306/*.pdf`, appeler `analyserPatrimoine`, comparer
  aux compteurs de `data/samples/S0306/`. ⚠️ vitest **ne charge pas `.env.local`** (sans quoi le
  mock répond en 5 s) et `MISTRAL_TIMEOUT_MS` est une **constante de module** lue à l'import, donc
  à poser dans l'environnement du process, pas dans un `beforeAll` ;
- **sonde de chaîne déterministe** : `TesseractOcrProvider` → `ocrVersPageTexte` →
  `parserTantiemesPositions` sur `RCP 2.pdf` p. 30-31.

Le smoke d'**acceptation** du port OCR (les trois cas de rotation) reste dans l'arbre : c'est un
verrou, pas une mesure.
