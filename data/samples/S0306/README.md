# Fixture S0306 — étage 2 (anonymisé, commité)

Étape 0 du chantier extraction. Fixture **deux étages** décidée dans
`docs/etude-indexation-extraction-patrimoine.md` §5 :

| Étage | Contenu | Où | Versionné |
|---|---|---|---|
| 1 | Les 14 PDF réels (28 Mo, PII de 44 personnes) | `data/S0306/` | ❌ `.gitignore:61` — réservé au benchmark OCR, qui a besoin des pixels |
| 2 | **Ce dossier** : jeu prouvé anonymisé + vérités attendues | `data/samples/S0306/` | ✅ c'est le test de régression |

Sans l'étage 2, une fixture dont les entrées sont gitignorées ne serait pas un test :
pas de CI, pas de reproductibilité, et dans six mois plus personne n'a les PDF.

## Provenance

Le jeu de référence vient d'une reprise **menée à la main** et prouvée par bouclage
arithmétique et contre-preuves croisées (PV d'AG, registre national, états de répartition) :

- **118 lots**, plages `1-66`, `101-122`, `201-208`, `301-308`, `401-408`, `501-506`
- **clé 001** Charges générales : 118 lots, Σ = **100 000** exact
- **clé 200** Charges ascenseur : 96 lots, Σ = **10 000** exact
  (exclus : 14 parkings extérieurs `101-114` + 8 lots du RDC `115-122`)
- **44 copropriétaires**, **118 attributions**, **0 lot orphelin**
- **44/44** appariements owner ↔ compte 450 du syndic sortant, 0 ambigu

## Fichiers

| Fichier | Rôle |
|---|---|
| `lots.json` | 118 lots (aucune PII : numéros, types, usages, étages) |
| `cles.json` | 2 clés avec leurs tantièmes par lot (aucune PII) |
| `owners.json` | 44 copropriétaires **pseudonymisés** |
| `attributions.json` | 118 liens lot ↔ owner (référence interne, aucune PII) |
| `owners_comptes450.json` | appariement owner ↔ compte 450, noms pseudonymisés |
| `contre-preuves.json` | totaux de tantièmes par owner + corruptions attendues détectables |
| `indexation-attendue.json` | vérité de l'indexation par apports sur les 14 documents |

## Propriétés de test préservées par la pseudonymisation

Les patronymes et adresses sont fictifs. **Les pièges, non** — c'est tout l'intérêt :

| Propriété | Occurrences | Ce qu'elle teste |
|---|---|---|
| Homonymes stricts, **même adresse** | 2 (`TOURNIER Delphine`) | La dédup ne doit **pas** les fusionner. Elles se départagent par leurs tantièmes (2 459 vs 1 998) et par les votes du PV. C'est le cas qui a fait perdre un owner au pipeline (43 au lieu de 44). |
| Homonymes stricts, **adresses différentes** | 2 (`CAZALS Eglantine`) | `donneesCompatibles` ne doit **pas** proposer la fusion : l'adresse est un élément distinctif. |
| **Prénom composé** | 1 (`ABADIE Jean Michel`) | Un prénom composé sans « et » n'est pas un couple. Le pipeline avait produit « Jean & Michel ». |
| Personnes morales **sans représentant légal** | 3 | Doivent déclencher la règle `SERVICE SYNDIC` (eStale refuse une société sans représentant) et la note « K-bis à fournir ». |
| Couples `m&mme` | 4 | Une seule ligne, prénom « Prénom Mr & Prénom Mme ». |
| Owners **sans prénom** | 5 (2 physiques + 3 morales) | Le prénom n'est pas obligatoire pour une personne physique, il l'est pour une morale. |
| Numéro de voie à **suffixe alphabétique** | conservés | Contrainte des 5 caractères : le suffixe part en tête de voie. |
| Multipropriétaires | 5 (jusqu'à 9 lots) | Attributions multiples, mandataire commun. |

## `contre-preuves.json`

**`totaux_tantiemes_par_owner`** — la contre-preuve des attributions : pour chaque owner,
Σ(tantièmes clé 001 de ses lots). Sur le lot réel ces totaux sont **imprimés sur la feuille
de présence** ; c'est ce qui localise une erreur d'attribution *par owner* au lieu de
constater des orphelins en fin de course. Analogue exact de `verifierTotauxParCompte`.

**`corruptions_attendues_detectables`** — 5 patronymes corrompus (transposition +
substitution, distance d'édition ≤ 2), **hors de la vérité** pour ne pas la polluer. Vecteurs
de test du filet noms : le tantième concorde, le nom diffère → la coquille doit être détectée.
C'est le seul filet possible sur les noms, et il n'existe pas encore.

## `indexation-attendue.json`

Vérité attendue de l'indexation par apports sur le lot réel. Deux usages :

1. **test de l'indexeur** : 14/14 documents, leurs apports, les plages de pages, le doublon
   de forme (`rgd.pdf` ≡ `Releve-general-depenses-date 2025.pdf` → préférer le texte), et le
   document à ne pas analyser ;
2. **démonstration chiffrée de l'échec du routage par nom** : `routage_par_nom_actuel` est
   renseigné pour chaque document — **6 corrects sur 14**. Les trois RGD et la fiche de
   synthèse partent en ANNEXE.

Il porte aussi deux sections qui n'existent pas encore dans le code :

- **`couverture_apports_requis`** — le contrôle miroir : `appels_de_fonds_par_cle` est absent
  du lot, donc le bloc C reste manuel. C'est un refus actionnable, pas une extraction ratée ;
- **`refus_actionnables_attendus`** — le message exact attendu pour la clé 200, avec les
  plages de lots manquantes calculées. Critère d'acceptation du chemin de refus.

## Ce que la fixture ne prouvera jamais

- L'exactitude d'un nom qui **ne vote pas** et n'a qu'une seule source.
- Un tableau scanné dont le **total imprimé est lui-même illisible** → refus, donc
  intervention humaine. C'est voulu.
- L'**équivalence inter-syndics** : ce lot est du REACT GESTION. Il en faut un troisième.
