# Bug report — extraction patrimoine S0306 (Le Tournois), dry-run du 30/07/2026

Cas de reproduction : dossier `S0306`, mêmes PDF sources que la reprise manuelle
faite en parallèle (Cowork). La reprise manuelle a produit un jeu **prouvé**
(118 lots, 2 clés bouclant à 100 000 et 10 000 exactement, 44 copropriétaires,
118 attributions, 0 orphelin), confrontée au PV d'AG, au registre national et
aux états de répartition. Elle sert ici de **référence attendue**.

Résultat du pipeline : 10 erreurs, 1 anomalie, 5 lots orphelins, 6 clés dont 4
fausses, 43 owners au lieu de 44. **Les auto-checks ont bien attrapé les
écarts — le problème est en amont, dans l'extraction.** Quatre causes racines.

---

## CAUSE 1 — Le prompt patrimoine mélange clés comptables et clés de répartition

**Symptôme.** 6 clés extraites : `001` (ok), `300 Charges Ascenseur`
(somme 38 000 ≠ attendu 10 000), `702/705 CHARGES COMPTEURS` (0 lot,
attendu 10 000), `998/999 Conso privative` (0 lot, attendu **1 120** et
**542** — ce sont les **m³** d'eau du RGD, pas des tantièmes).

**Cause.** `prompts-extraction.ts`, `SYSTEME_PATRIMOINE`, règle « CLES REELLES
(comptabilite) : … les annexes comptables FONT FOI pour les cles reellement
utilisees en compta → crée alors DEUX cles distinctes avec leurs tantiemes
propres ». Cette règle pousse le modèle à créer une clé de répartition
patrimoine pour **chaque clé comptable** vue dans le RGD, même sans tableau de
tantièmes. Faute de tableau, il remplit `totalAttendu` avec ce qu'il trouve :
un budget, un total de consommation en m³.

**Réalité métier** (fiches vault + reprise manuelle) : les clés compteurs
(702/705) et les consommations privatives (998/999) ne sont **pas** des clés de
répartition à tantièmes — elles relèvent du module compteurs et des imputations
directes. Elles n'ont pas leur place dans le patrimoine.

**Fix proposé.**

1. Dans le prompt : une clé de répartition n'est créée **que si un tableau de
   tantièmes par lot existe** (RCP/EDD/annexe). Une clé vue uniquement en
   compta (RGD) sans tableau → **note** (« clé comptable X sans tableau de
   tantièmes — module compteurs / imputation directe, hors patrimoine »),
   jamais une clé.
2. `totalAttendu` ne peut provenir **que** de l'en-tête ou du pied d'un tableau
   de tantièmes. Jamais d'un budget, d'un total de dépenses ou d'un volume.
3. Auto-check complémentaire (`auto-checks.ts`) : une clé avec 0 tantième est
   une **erreur de construction** à rejeter de l'extraction, pas seulement un
   écart à afficher.

---

## CAUSE 2 — Tantièmes transcrits par le LLM : la règle « l'IA ne transcrit jamais » n'est appliquée qu'à la compta

**Symptôme.** Clé `300` : 38 lots, somme 38 000, attendu 10 000. La vraie clé
ascenseur (modificatif RCP du 06/03/1975) porte **96 lots pour 10 000**
(56/lot au sous-sol, quotes-parts par étage). Le tableau source est un **scan**
— le modèle ne pouvait pas le lire, il a **fabriqué** ~1 000 × 38 lots.
Idem, plus discret : `VENDRAMBILI` pour VENDRAMELLI, `BOUTON Olivier` pour
BOUTON Olivia — coquilles de transcription pure.

**Cause.** L'extraction patrimoine (`claude-extraction-provider`,
`mistral-extraction-provider`) est **full-LLM** : le modèle recopie des
chiffres et des noms. C'est exactement le mode qui a été **banni de la compta**
après l'écart de 122,61 € (d'où `couche-texte-provider` + parseur par
positions). Le patrimoine n'a pas eu droit au même traitement, alors que les
tantièmes sont aussi critiques que les écritures.

**Fix proposé.**

1. **Étendre le principe couche-texte au patrimoine** : quand la FDP/l'EDD a
   une couche texte, parser les tantièmes et les numéros de lots
   **déterministiquement** (positions x, comme `parseur-grand-livre-positions`) ;
   le LLM ne sert qu'à produire la spec de format.
2. **Un tableau scanné est un bloqueur, pas une invitation à deviner** : si la
   source d'une clé est un scan inexploitable, l'extraction émet la clé avec
   `totalAttendu` et **zéro tantième + note bloquante** (« tableau illisible,
   fournir la page N ou un export »), et `prochaine-etape.ts` doit avoir un cas
   dédié (comme `comptaErreur` pour le grand livre).
3. Garde-fou arithmétique **dans l'extraction** : si Σ(tantièmes émis) ≠
   totalAttendu, ne pas émettre les tantièmes du tout (note), plutôt que
   d'émettre un jeu faux que les checks signaleront trop tard.

---

## CAUSE 3 — Déduplication : la civilité et les lots ne comptent pas comme éléments distinctifs

**Symptôme 1.** 43 owners au lieu de 44 : les deux **REDISSI Jeannette** (Mme,
lots 50/112/122, 2 459 tantièmes · Mlle, lots 3/55/120, 1 998 tantièmes) ont
été **fusionnées à l'extraction**. Ce sont deux personnes (le PV les fait voter
séparément : « REDISSI Jeannette (1998), REDISSI Jeannette (2459) »).

**Symptôme 2.** « Fusion proposée (R7) pour "gouge|isabelle" : 2 entités
identiques ». Les deux GOUGE Isabelle ont des **adresses différentes** (24 rue
Franklin vs 86 bis rue Charles Laffitte à Neuilly) et des lots différents — ce
sont deux personnes, la fusion ne devrait même pas être proposée en
« compatibles ».

**Causes.**

- Prompt `SYSTEME_PROPRIETAIRES`, règle R6 : « même nom+prénom **sans élément
  distinctif** → ne pas fusionner ». La civilité (Mme/Mlle) et les lots détenus
  ne sont pas cités comme éléments distinctifs → le modèle fusionne.
- `dedup.ts` : `cleIdentite = nom|prenom` seulement, et `donneesCompatibles`
  ne compare que naissance/email/siren/pro — **jamais l'adresse ni les lots**.
  Deux homonymes sans données = « compatibles » = fusion proposée.

**Fix proposé.**

1. **Prompt** : interdire toute fusion par le modèle quand les deux lignes de
   la FDP portent des **lots distincts** — c'est le cas VIDAL n°1/n°2
   uniquement si les lots sont les mêmes ou si la FDP duplique la même
   personne. Ajouter : « éléments distinctifs = civilité différente (Mme/Mlle),
   adresse différente, lots différents ». En cas de doute : **deux owners +
   note**, la fusion se fait dans l'éditeur de corrections, jamais à
   l'extraction.
2. **`dedup.ts`** : intégrer l'adresse et l'ensemble des lots dans
   `donneesCompatibles`. Adresse renseignée et différente, ou ensembles de lots
   disjoints → `doublon_non_tranchable`, pas `fusion_proposee`.
3. **Levier déjà dans le code** : le total de tantièmes par owner (dérivable
   des attributions) est une clé **déterministe** pour distinguer des homonymes
   — c'est ce que fait `liaison-comptes` avec les 450. L'utiliser aussi ici.

---

## CAUSE 4 — Attributions : numéros de lots transcrits sans contre-preuve

**Symptôme.** 5 lots orphelins (29, 38, 106, 116, 204) **avec** 118
attributions au total → des lots ont reçu **deux** propriétaires pendant que
d'autres n'en ont aucun. `204` n'existe pas comme orphelin plausible : la FDP
porte le lot 204 chez PETITVALLET — c'est un numéro voisin mal transcrit
(cause 2, encore).

**Fix proposé.** Contre-preuve par les **totaux de tantièmes par
copropriétaire** imprimés sur la FDP (« Nombre de tantièmes : X ») : pour
chaque owner, Σ(tantièmes clé défaut de ses lots) doit égaler le total imprimé.
C'est le même geste que la réconciliation à-nouveau de la compta, et ça
localise l'erreur **par owner** au lieu de constater des orphelins en fin de
course. À câbler dans l'extraction (relecture) et dans `auto-checks.ts`.

---

## Divergence de convention à trancher (pas un bug)

`SYSTEME_PROPRIETAIRES` ligne 28 : co-acquéreurs à patronymes différents
reliés par « et » → `m|mme` (ex. l'écran affiche « m|mme BOURGEOIS / ESTEVE »).
La reprise manuelle et les conventions du skill ont retenu `m&mme` pour
« M. et Mme BOURGEOIS & ESTEVE Marc & Caroline ». Les deux se défendent ;
il faut **une seule** règle, écrite au même endroit pour le prompt, le skill
et le vault.

Autre cas limite du même prompt (ligne 27) : « BARDON Jean & Michel » — le
prénom composé « Jean Michel » a été scindé en deux prénoms de couple. La règle
« Prenom Mr & Prenom Mme » ne devrait s'appliquer que si les deux prénoms sont
**explicitement rattachés à deux personnes** ; un prénom composé sans « et »
reste un prénom.

---

## Pourquoi la reprise manuelle a mieux marché (même code disponible)

Ce n'est pas un problème d'accès au code — c'est un problème de **mode
d'exécution** :

1. **Boucle interactive vs one-shot.** Face au tableau ascenseur scanné et
   incomplet, la reprise manuelle a pu zoomer page par page, constater la page
   manquante, **la demander**, la recevoir et boucler à 10 000. Le pipeline n'a
   aucun chemin « demander la pièce manquante » pour le patrimoine — il a
   comblé le trou en inventant.
2. **Transcription déterministe vs LLM.** Les tantièmes et noms de la reprise
   manuelle sortent d'un parseur (positions x) prouvé par bouclage
   arithmétique. Le pipeline patrimoine fait recopier les chiffres par le
   modèle — le mode banni de la compta pour exactement ces symptômes.
3. **Contre-preuves pendant l'extraction, pas après.** Totaux FDP par owner,
   votes du PV, registre national : chaque nombre a été confronté à une
   deuxième source **avant** livraison. Le pipeline vérifie après coup et ne
   peut que constater.

Les trois sont transposables au pipeline : c'est le sens des fixes ci-dessus.
La bonne nouvelle : la couche domaine (auto-checks, dedup, liaison,
prochaine-etape) a fait son travail — tout est réparable dans l'extraction et
les prompts sans toucher à l'architecture.

## Ordre d'attaque suggéré

1. **Cause 1** (prompt clés) — une heure, gain immédiat : 4 fausses clés en moins.
2. **Cause 3** (dedup + prompt R6) — évite les fusions destructrices.
3. **Cause 4** (contre-preuve tantièmes/owner) — tue les orphelins fantômes.
4. **Cause 2** (couche texte patrimoine) — le vrai chantier, même mouvement
   que l'incrément 1bis de la compta.
