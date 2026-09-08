# Comptabiliser les factures REAL31 dans ESTALE - spike du 2026-09-08

**Question posée** (demande du patron) : quand l'intranet génère les factures d'honoraires,
comment les faire arriver dans ESTALE ? Par l'adresse mail d'intégration du facturier, ou
par l'API ?

**Réponse retenue** : par l'API, mais en déposant une **facture à valider**
(`createInvoicePrediction`), **jamais** en créant l'écriture comptable directement
(`createInvoiceCondo`). Voir « Pourquoi » plus bas : l'écriture directe est irréversible ET
payable.

Tout ce qui suit a été mesuré en réel sur **SE999** (copro de test), pas déduit du schéma.

---

## Ce que fait chaque voie

| | Écriture directe `createInvoiceCondo` | Facture à valider `createInvoicePrediction` | Adresse mail du facturier |
|---|---|---|---|
| Comptabilisée d'emblée | oui | non | non |
| Payable sans intervention humaine | **oui** | non | non |
| Corrigeable après coup | **non** (ni API ni interface) | oui | oui |
| Supprimable | **non** | oui (`deleteInvoicePrediction`) | oui |
| Copropriété désignée | par l'appel | par l'appel (`condoID`) | devinée par la reconnaissance de texte |
| Imputation comptable | fournie par l'appel, exacte | proposée par ESTALE, confirmée par la comptable | idem |
| Transfert manuel | non | non | oui (il faut envoyer le courrier) |

## Pourquoi l'écriture directe est écartée

`createInvoiceCondo` produit une facture **complète et correcte** : sur un test à 1,23 EUR,
ESTALE a généré l'écriture fournisseur (crédit `4010001 REAL 31 - LGC`), sa contrepartie de
charge (débit `6211`) et la TVA (0,205), et le PDF s'attache ensuite par
`updateEntry(id).updateFile(file)`.

Le problème est ailleurs : **cette facture ne peut plus être ni modifiée ni supprimée**,
alors qu'elle **peut être payée**. Voies essayées, toutes refusées par le serveur (message
`Oupss une erreur s'est produite`, le seul que renvoie l'API quelle que soit la cause) :

- suppression de la ligne fournisseur et de sa contrepartie ;
- après avoir détaché le PDF ;
- depuis les statuts `VALIDATION`, `PAYMENT`, `ONGOING` et `SUSPENDED` ;
- exercice verrouillé comme déverrouillé.

L'interface ESTALE ne peut rien non plus (vérifié par Sekou). Une facture créée à la main
dans l'interface, elle, reste modifiable : la comparaison champ par champ des deux montre
des objets **structurellement identiques** (mêmes comptes, même `multipleID`, même forme).
L'origine seule les distingue.

Conséquence : une erreur de montant, de copropriété ou un doublon serait **définitif**, et
de l'argent pourrait sortir du compte du syndicat sur la base d'une facture fausse. C'est
l'objection du patron, elle est fondée.

> Une facture de test à 1,23 EUR (`SPIKE INTRANET honoraires T3 2026`, entry
> `e1d9f5ea-d1f0-47e2-8856-3e4f7dfbe3b0`) reste bloquée sur SE999, statut `ONGOING`. Seul
> le support ESTALE peut la retirer. À signaler comme anomalie produit au passage.

## La voie retenue, prouvée de bout en bout

```graphql
mutation($input: InvoicePredictionCreateInput!) {
  createInvoicePrediction(input: $input) { id label condoID fileID }
}
# input : { condoID, establishmentID, file: Upload! }   (upload multipart, cf. estale-upload-poc.mjs)
```

Testé deux fois sur SE999 : la facture arrive dans **Comptabilité > Paiement**, ESTALE lit
le PDF et en déduit le libellé tout seul, et `deleteInvoicePrediction(id)` la retire
proprement. Rien n'est comptabilisé ni payable tant que la comptable n'a pas validé.

Ce qu'on garde par rapport au canal mail : la copropriété est **désignée explicitement**
(pas devinée), aucun transfert de courrier à faire, et l'intranet trace ce qui est parti
(donc l'anti-doublon reste possible côté intranet).

Ce qu'on accepte : la comptable valide chaque facture, y compris les dizaines d'une fournée
trimestrielle. C'est le prix du garde-fou, et il a été assumé explicitement.

## Référentiel nécessaire (relevé sur SE999)

Rien à créer : tout existe déjà.

- Fournisseur **REAL 31 - LA GARENNE COLOMBES** (`2da6e410-...`), compte `4010001`.
- Comptes de charge, chacun portant **déjà** sa clé de répartition, son taux de TVA et ses
  attributs récupérable/déductible - donc la ventilation se dérive du compte, sans saisie :

| Prestation intranet | Compte ESTALE |
|---|---|
| Gestion courante (honoraires) | `6211` Rémunération du syndic |
| Frais postaux | `6213` Frais postaux |
| Suivi de travaux | `6221` Honoraires travaux |
| Dépassement AG / CS, prestations | `6222` Prestations particulières |
| État daté, pré-état daté | **hors périmètre** : facturé au copropriétaire vendeur, pas à la copropriété (mutation distincte `createInvoiceOwner`) |

## Points d'attention pour le module

1. **Exercice verrouillé** : aucune écriture ne passe si l'exercice l'est (SE999 l'était
   depuis le 18/08). Lire `condo.accountings { lockedAt closedAt }` **avant** d'envoyer et
   le dire clairement, plutôt que d'échouer sur un message opaque.
2. **Anti-doublon côté intranet** : marquer en base ce qui est parti chez ESTALE. Une
   facture ne part qu'une fois.
3. **Aperçu avant fournée**, sur le modèle du filet de facturation gestion courante.
4. **Messages d'erreur** : l'API renvoie toujours le même texte. Le diagnostic doit venir
   des vérifications faites en amont, pas de la réponse serveur.
5. **Une dizaine de copropriétés** concernées à ce jour, mais le périmètre s'étend à toutes
   les prestations (pas seulement le trimestre) : le branchement se fait sur l'entonnoir
   commun `emettre-factures-en-attente`, après émission Pennylane.

## Références

- Article ESTALE : <https://help.estale.app/fr/article/comptabiliser-des-factures-multi-coproprietes-1jwjuz1/>
- Schéma : `docs/estale-schema.graphql` (`createInvoiceCondo` l.9516,
  `createInvoicePrediction` l.9518, `deleteInvoicePrediction` l.9519,
  `InvoicePredictionCreateInput` l.6320, `EntryMutation` l.4271)
- Upload multipart : `scripts/estale-upload-poc.mjs`
- Décision liée : la rémunération du syndic reste budgétée en 6211 et Pennylane fait foi
  (arbitrage patron du 2026-09-08, `generateFees` ESTALE non utilisé).
