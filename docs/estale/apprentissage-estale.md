# Apprentissage eStale - intégration intranet

Ce qu'on a appris en branchant eStale (Phase B, ADR-022), pour ne pas re-tâtonner.
Code : `src/lib/adapters/estale/`. Schéma : `docs/estale-schema.graphql` + `-summary.md`.

## Accès / auth (vérifié 2026-06-12)

- **Login** : `POST https://api.estale.app/api/login` body `{email, password}` -> cookie `estale` (Set-Cookie). (PAS `estale.app/intranet-gql`.)
- **GraphQL** : `POST https://api.estale.app/graphql/intranet` avec le cookie.
- Client : `client.ts` (`estaleGql`, re-login auto sur 401/403, timeout 30 s). Identifiants dans `.env.local` (`ESTALE_BASE_URL/EMAIL/PASSWORD`). Scripts : `scripts/estale-health.mjs`, `estale-discover.mjs` (aucun secret loggé).
- **Compte de service unique** côté serveur : les 43 collaborateurs n'appellent jamais eStale, le cloisonnement reste côté intranet (`managerId`). Auj. = compte perso Sekou (6 condos) ; compte de service dédié à créer pour la prod (ADR-005).
- **Pas de query liste cross-copros** : on itère `me.collaborator.condos(archived:false)`. Résolution copro par **référence normalisée** (`S0299` <-> `S299`, regex préfixe-lettres + nombre sans zéros). Les **références font foi** (décision Sekou) ; `externalIdEstale` non utilisé. Cache module 10 min.

## Pièges (importants)

- **`accountByNomenclature(n)` est capricieux** : ne répond de façon fiable que pour la racine `"6"`, lève "Oupss une erreur" pour 60/105/450/671... -> **passer par la liste** `accountingV2.exercice.accounts(archived:false) { nomenclature statisticsPeriod(period) { debit credit balance } }` (264 comptes, ~480 ms, 1 requête) et filtrer en code.
- Champ **non-null qui lève** (ex. `accountByNomenclature`) -> casse toute la requête (data nulle). Isoler les requêtes compta en **try/catch** séparé pour ne pas perdre CS/contrats.
- **Daterange** = scalaire sérialisé en **tableau** `["2026-01-01","2026-12-31"]` ; en input idem.
- **Noms inversés** : convention eStale = nom en MAJUSCULES, prénom en casse normale. Mais saisie parfois inversée (`last="Emmanuel" first="LOPES"`) -> détecter par la casse et remettre à l'endroit. Souvent `firstname` vide et tout le nom dans `lastname` -> fallback `fullname`.
- `litigation.count` > 0 mais `litigation.items` revient **vide** (détail non récupérable -> on garde le compte).
- `accountingV2.periodCurrent` parfois `null` (S300) -> fallback sur `exercices[0]`.

## Mapping ODJ <- eStale (ce qui est branché)

| Champ ODJ | Source eStale | Détail |
|---|---|---|
| Présents - conseil syndical | `condo.council { role owner{fullname lastname firstname} }` | président en tête ; format "NOM Prénom" |
| Historique AG | `condo.meetings { category startAt transcript{validated} }` | ORDINARY=AG sinon AGE ; `transcript.validated` = PV dispo |
| AG en visio | `condo.meetingVideo` | pré-remplit le toggle |
| PPT / DPE (applicabilité) | `condo.constructionDate` (Int, année) | PPT si >15 ans ; DPE si <=2013 |
| Contrat gaz / élec | `condo.contracts { label category period }` | catégories `ENERGY_GAS` / `ENERGY_ELECTRICITY` |
| Procédures en cours | `condo.litigation.count` | détail indispo (items vide) |
| Budget prévisionnel | `accountingV2.exercice.budgetOrdinary.amount` | exercice courant |
| Total dépenses courantes | compte **`6`** (charges), `statisticsPeriod.debit` | -> trop-perçu/dépassement = budget - dépenses |
| Consommation eau | écritures du compte **`601`** (`entries(coaIDs)`) | volume lu dans le **libellé** (`"... - 71m3"`), prix/m³ = montant/volume |
| Fonds travaux | compte **`105`** (ALUR), `-balance` | solde créditeur |
| Travaux votés | **`702Txx`** crédit (appelé) + **`671Txx`** débit (dépensé) | reliés par le code chantier (T-suffixe) ; hors lignes "Lot n°X" |
| Copropriétaires débiteurs | `condo.owners { balance(accountingID) }` | solde > 0 = débiteur ; signale si > 5% du budget |

## Plan comptable copro (nomenclatures utiles)

`6` charges - `601` eau - `67`/`671` charges travaux (décidés AG) - `105` fonds travaux ALUR - `102` provisions travaux décidés - `103`/`1031` avances (fonds roulement) - `450` copropriétaires - `502` "Autre compte" (fonds placés à confirmer) - `702Txx` provisions travaux par chantier - `121Txx` solde travaux - `711Txx` produits travaux art.14-2.

## À faire plus tard
- **vs N-1** (eau, budget) : nécessite un exercice précédent (les copros test n'en ont qu'un).
- **Débiteurs fin d'exercice** : idem (exercice clôturé).
- **Fonds placés** (502 ?), dépenses constatées travaux quand le 671 sera alimenté.
- **Compte de service eStale dédié** (accès toutes copros) pour la prod.
