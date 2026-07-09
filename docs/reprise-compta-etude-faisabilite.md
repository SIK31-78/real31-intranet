# Reprise comptable eStale - etude de faisabilite (2026-07-09)

Etude (lecture seule, aucune ecriture) sur l'automatisation de la reprise comptable d'une copro dans eStale, en prolongement du module reprise-copro (ADR-030 = injection patrimoine deja en prod). Copro de reference : S0302 (grand livre exercice 01/10/2025 -> 30/09/2026 dans `data/`).

## Verdict

**Automatisable en grande partie, avec un filet solide.** L'API eStale expose tout le necessaire pour les classes 4/5/6 (import bulk `importEntries` du xlsx ET granulaire `createEntryExpert` avec TVA/deductible natifs), et surtout la **verification par balance classe par classe est faisable en lecture** (`Accounting.balance`, `AccountingAccount.solde`/`.statisticsPeriod{debit,credit}`, exports `generalBalance`/`ownersBalance`/`suppliersBalance`). Le critere "la balance tombe a 0" est directement mesurable.

Deux incertitudes honnetes : (1) `importEntries` bulk **ne rend aucun ID** de ligne -> pas de rollback capture ni de feedback ligne par ligne (d'ou reco granulaire) ; (2) l'eclatement classes 1/7 via `createEntryDispatch` est **plausible mais non prouve** sur le schema seul -> a valider sur copro test, sinon reste manuel (faible volume, acceptable).

## API eStale verifiee (docs/estale-schema.graphql)

- **Ecriture** : `importEntries(condoID, file)->Condo` (bulk, pas d'ID) ; `createEntryExpert(input)->Entry` (granulaire, ID capture, `amount/movement/ledger/vat/recoverable/deductible/dkID/accountID`) ; `createEntry` (ventile, breakdowns) ; `createEntryDispatch(input)->AccountingAccount` (ECLATEMENT par cle : `dkID!, accountID!, movement, lines:[{suffix,amount}], compensation`) ; `updateEntry(id).delete/.update` (rollback cible) ; `createSupplier(input,condoID)->Supplier{reference}` (mapping 401) ; `updateAccountingAccount(id).append({dkID,suffix,name})` (creer sous-comptes 471999/471998).
- **Lecture / gardes-fou** : `Accounting.balance:Float`, `Accounting.entries(coaIDs,ledgers)`, `Accounting.accounts(archived)`, `AccountingAccount.solde`/`.statisticsPeriod{count,debit,credit}`, exports `generalBalance(balanced,include489...)` / `ownersBalance` / `suppliersBalance`, `Establishment.chartOfAccounts` (plan comptable modele).
- Enums : `EntryLedger{BANK PURCHASE CARRYFORWARD GENERAL SALE FUNDRAISING CLOSING DISTRIBUTION}` (la reprise = `carryforward`), `EntryMovement{CREDIT DEBIT}`.

## Template `data/entries.xlsx` (feuille "Ecritures")

Colonnes : A Date (JJ/MM/AAAA, requis), B Libelle (<=180, requis), C Piece (<=40), D Journal (`carryforward` pour la reprise), E Compte (nomenclature 7 chiffres, ex 5120001, requis), F Cle (3 car, defaut 001), G Type (`debit`/`credit`, requis), H Montant TTC (requis), I TVA, J Deductible, K Recuperable, L Commentaire (<=2000). **Limite dure 10 000 lignes/import.** Les colonnes TVA/deductible/recuperable existent -> la classe 6 passe par le meme fichier.

## Automatisable vs manuel, bloc par bloc

- **BLOC A (classes 4/5, import Ecritures)** : ~80 % auto. Conversion grand livre -> lignes (garder 4/5, ABS, D/C, journal carryforward) deterministe. Point dur = **mapping des comptes** : 401 fournisseurs -> reference eStale (via `suppliersBalance`/`chartOfAccounts`, ou `createSupplier` qui rend la `reference`) ; **450 coproprietaires -> reutiliser les references eStale DEJA capturees a l'injection patrimoine** (chaque `createOwner` rend `{id,reference}` ; reco : indexer `ids.ownerRefParId` dans `RapportInjection`, aujourd'hui seul l'`id` est indexe) ; 471->472, 489 souvent non repris, 408 tel quel (regles statiques) ; comptes d'attente 512->471999 Banque Ancien Syndic / 501->471998 Livret (sous-compte suffixe 00 via `append`).
- **BLOC B (classe 6, via RGD)** : automatisable MAIS **le fichier RGD n'est pas dans data/** (indispensable : il porte TVA + part deductible, absentes du grand livre). Reco `createEntryExpert` granulaire (ID capture + vat/deductible natifs).
- **BLOC C (classes 1/7, eclatement)** : `createEntryDispatch` colle a l'eclatement par cle (un appel par cle pour un 701 sur plusieurs cles) MAIS semantique non prouvee (compensation ? a-nouveaux vs appels courants ? cles compteur ?) -> **a valider sur copro test, sinon manuel** (module Eclatement UI eStale). Faible volume.

## Gardes-fou (le coeur de la demande)

Principe : on ne fait pas confiance a l'ecriture, on fait confiance a la BALANCE RELUE.
- **Avant (deterministe, bloquant)** `compta-checks.ts` facon auto-checks patrimoine : sum(debit)==sum(credit) global ET par classe ; ABS + D/C coherent avec le signe source ; tout compte non mappe = ERREUR bloquante ; rapprochement compteurs (lignes RGD attendues, nb 450 vs owners) ; balance calculee == totaux du grand livre source.
- **Dry-run par defaut** (plan complet + xlsx repli, zero reseau) + **gate ESTALE_ECRITURE=reel + GO/STOP humain** (identique ADR-030) + throttle 25ms.
- **Apres (relecture eStale)** : apres A+B la balance n'est pas encore 0 (normal) -> verif classe par classe (`statisticsPeriod`/`solde`) ; **apres C, `Accounting.balance==0`** (critere d'acceptation final) ; relecture `entries(ledgers:["carryforward"])` pour confronter au plan.
- **Rollback** : granulaire -> liste inverse `.delete()` prete non-auto (comme ADR-030) ; bulk -> pas d'ID, defaire via relecture du journal carryforward. Argument fort pour le granulaire.

## Architecture proposee (hexagonal, module reprise)

Nouveau port dedie `EstaleComptaProvider` (pas d'extension du port patrimoine, responsabilites distinctes) :
```
src/lib/reprise/
  domain/compta.ts, compta-checks.ts (= LA balance, equilibre par classe, pur+teste)
  ports/estale-compta-provider.ts (importerEcritures, creerEcritureExpert->id, eclater,
    creerFournisseur->reference, creerSousCompte, lireBalance, lireComptes, lireSolde)
  adapters/estale-compta/{dry-run,reel}-provider.ts (reel = seul a connaitre estaleGql,
    throttle 25ms, gate ADR-030) ; adapters/extraction (grand livre/RGD PDF -> lignes,
    memes moteurs IA + auto-checks=balance) ; adapters/xlsx (repli entries.xlsx)
  services/mapping-compta.ts (compte source -> {nomenclature, cle, journal}) ;
    reprendre-compta.ts (orchestrateur A/B/C, plan dry-run, refus si erreurs, GO/STOP, verif balance)
```
Modif existante mineure : indexer `ids.ownerRefParId` dans `RapportInjection` (reference deja capturee, pas indexee) pour relier 450 <-> coproprietaire sans re-requete.

## Decoupage en increments (du plus sur au plus engageant)

- **Inc. 0** harness lecture seule : brancher `balance`/`accounts`/`statisticsPeriod`/`generalBalance`, verifier sur une copro deja saisie qu'on sait mesurer "balance a 0".
- **Inc. 1** extraction grand livre + balance offline (dry-run only) : parser, exclure reports/totaux, ABS, D/C, balance par classe == totaux source, generer xlsx. Zero ecriture.
- **Inc. 2** resolveur de mapping (dry-run) : 401/450/47x/50x + warnings non-resolus ; 0 compte non mappe sinon stop.
- **Inc. 3** BLOC A reel sur copro TEST (granulaire) : gate + GO/STOP, relecture soldes 45x/47x/50x/401, rollback demontre.
- **Inc. 4** BLOC B (classe 6) sur TEST : necessite le RGD, `createEntryExpert` avec TVA/deductible.
- **Inc. 5** BLOC C (1/7) : valider `createEntryDispatch` sur un 701/2 cles ; **balance globale == 0** ; sinon documenter BLOC C manuel.

## Questions a trancher (Sekou)

1. Reprendre TOUTES les ecritures ou seulement les SOLDES (a-nouveaux) ? (reco : soldes, plus leger, verif sur solde par compte de toute facon).
2. Bulk `importEntries` ou granulaire `createEntryExpert` ? (reco : granulaire pour A/B = ID capture + rollback + feedback).
3. Fichier RGD/EDD (classe 6) : peux-tu le deposer dans data/ ? sinon BLOC B bloque.
4. `createEntryDispatch` = vrai eclatement de reprise ? a prouver sur copro test.
5. Mapping ancien 450 -> coproprietaire eStale : appariement par nom (assiste, warnings) ou relecture des comptes 450 crees ? (source d'erreur la plus probable).
6. Sur quel exercice/accountingID s'impute la reprise, faut-il l'ouvrir/creer d'abord ?
7. Regle 489 (non repris si equilibre, flag `include489`) + creation 471999/471998 par `append(suffix)` : ok ?
