# Revue du module Facturation / Récap AG / Gestion courante

Document de revue pour la session Claude Code principale.
Rédigé le 2026-07-23 par la session qui a porté le module depuis PowerApps.

> Ce module a été construit **en session isolée**, sans connaissance fine de ce
> que tu as déjà développé dans l'intranet. Il fonctionne, il est testé, mais il
> n'est **pas commité** et **pas intégré** au reste. Ta mission : le relire avec
> un œil critique et adversarial avant de le committer, vérifier son intégration,
> et challenger les décisions.

---

## 1. Ta mission

**Relis, challenge, intègre.** Concrètement :

1. **Correctness (adversarial).** C'est du code qui **facture de l'argent réel** à
   des clients via Pennylane. Cherche les bugs, surtout dans les calculs monétaires
   et les conversions TTC/HT/TVA. Ne fais pas confiance : reproduis les calculs.
2. **Intégration.** Ce module vit à côté de tes modules existants, pas dedans.
   Trouve où il devrait se brancher (voir §4) et les doublons qu'il crée.
3. **Règles internes.** Vérifie le respect de : ADR-001 (hexagonal, boundaries
   ESLint), conventions du repo (`intranet_*` dans `public`, référence logique sans
   FK vers Prisma, RLS off), CLAUDE.md, nommage, ton humain sans marqueur IA.
4. **Commits.** Rien n'est commité. Aide à découper en commits atomiques propres.
5. **Données sensibles.** Voir §7 : des seeds SQL et des CSV contiennent des
   montants réels par copropriété. Décider ce qui va dans git.

---

## 2. Ce qui a été construit

Portage de la solution PowerApps `MYTHEC_REAL31_Automation` (audit complet dans le
dépôt voisin `mythec-refactor`, fichiers `powerapps/INVENTORY.md`,
`MIGRATION_PLAN.md`, `office-scripts/ContratReplace.ts`).

### Domaine pur (testé, sans Zod ni Date, cf. domain/README)
- `domain/facturation/` : `commun` (TVA, arrondi demi-heure, créneau), `depassement-cs`,
  `depassement-ag`, `honoraires-travaux`, `honoraires-sinistre`, `gestion-courante`,
  `produits` (constantes de catégories).
- `domain/contrat/duree-contrat` : calcul de durée (portage de l'Office Script).
- `domain/recap-ag/fonds-travaux` : règle du minimum légal (avertissement non bloquant).

### Ports + adapters (Supabase + mock)
- `ports/facturation-repository` (tarifs, contrats, factures, produits, gestion courante).
- `ports/recap-ag-repository`.
- `ports/invoicing-provider` + `adapters/pennylane/` (payload pur + provider HTTP) + no-op.

### Services (`services/facturation/`)
- 5 prestations SYNDIC (dépassement CS, suivi travaux, suivi sinistre, pré-état daté,
  état daté) : chacune `apercuXxx` (sans écriture) + `creerXxx`, MÊME calcul partagé.
- `creer-recap-ag` : récap AG + dépassement AG + ouverture de cycle de contrat.
- `gestion-courante` : facturation trimestrielle (panneau comptable).
- `emettre-factures-en-attente` : émission Pennylane scopée à des ids explicites.

### UI
- `/facturation` (gestionnaire, 5 prestations, écran de validation commun + historique).
- `/recap-ag` (récap d'AG).
- `/gestion-courante` (panneau comptable, facturation du trimestre).
- Entrées sidebar (dont vue comptable épurée).

### Schéma (tables natives `public.intranet_*`, TOUTES déjà exécutées en base)
`intranet_tarifs`, `intranet_suivi_contrats`, `intranet_factures` (+ `_lignes`),
`intranet_recap_ag` (+ `_travaux`), `intranet_produits`. SQL dans `supabase/sql/`.

**Vérif** : `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — tout vert
(1045 tests au 2026-07-23). Smokes manuels réels : `facturation-e2e.smoke.ts`,
`gestion-courante-pdf.smoke.ts` (créent de VRAIS brouillons Pennylane, à ne jamais
mettre en CI — nommés `*.smoke.ts`, hors du `vitest run` par défaut).

---

## 3. Décisions à challenger (validées avec Sekou, mais à re-challenger)

| Décision | À vérifier |
|---|---|
| `Tarifs`/contrats stockent du **TTC**, HT facturé = TTC / 1,2 | Corroboré par les données (HT ronds). Vérifier la cohérence partout. |
| **Timbres hors TVA** (÷4 sans ÷1,2), `vat_rate: "exempt"` | Est-ce le bon traitement TVA des débours postaux ? |
| Montant **recalculé serveur**, jamais reçu du client... | ...SAUF pré-état daté / état daté qui se **négocient** (pré-rempli, modifiable). |
| Négociation **tracée en base mais PAS sur le PDF client** | Décision commerciale de Sekou (2026-07-21). |
| Fonds travaux < 5 % → **avertissement, pas blocage** | Le gestionnaire tranche (copros dispensées). |
| **Récap AG = couche autonome**, indépendante de `conclureAg` | Deux notions de « fin d'AG » coexistent. À réexaminer (§4). |
| **Aucune écriture dans `public."Copropriete"`** | Le legacy écrivait `ppt` ; pas reproduit (risque de drift Prisma). |
| Émission **scopée à des ids explicites**, jamais « toute la file » | Pour pouvoir laisser des factures en attente sans les émettre par ricochet. |
| Gestion courante : **trimestre civil** (`AAAA-Tn`), réservée **comptable**, idempotente par période | Les trimestres cabinet sont-ils calendaires ou calés sur l'exercice contractuel ? |
| `getDernierContrat` = contrat **en vigueur** (début ≤ aujourd'hui) | La liste contient des contrats datés dans le futur (renouvellements). |
| Dédup contrats en doublon : **plus grand ID SharePoint gagne** | Reproduit le `$orderby Created desc` du legacy. |
| Résolution produit **non bloquante** (repli sur libellé par type) | Une catégorie non résolue n'empêche pas d'émettre. |

---

## 4. Pistes d'intégration à examiner

Le module a été construit sans se brancher sur l'existant. À creuser :

1. **Travaux votés en AG → dossiers travaux.** `intranet_recap_ag_travaux` (libellé,
   budget, clé de répartition, modalités d'appel de fonds, **numéro de résolution**)
   vit isolé. Le module `dossiers` existe. Créer un dossier travaux par poste ?
2. **Numéro de résolution → module ODJ / Résolutions.** Champ texte libre aujourd'hui ;
   devrait référencer une vraie résolution.
3. **Facturation sinistre → module `/sinistre`.** Libellé de sinistre en texte libre ;
   devrait sélectionner un dossier `intranet_sinistres` existant.
4. **Récap AG vs `conclureAg`** (supervision-ag). Deux « fins d'AG ». À réexaminer.
5. **Récap AG → jalons post-AG** (`domain/jalons-ag` : SCAN_CONTRAT, NOTIF_PV,
   ARCHIVAGE). Enregistrer un récap pourrait en marquer.
6. **Récap AG → dates copro** (`lastAGDate`/`nextAGDate`). Attention : terrain du
   chantier eStale-live / `CoproDatesRepository`.
7. **Notification comptable.** Le legacy `NotifComptable` envoyait un mail (bloqué
   Entra ID DSI). Une **note automatique** dans `intranet_compta_notes` en substitut ?
8. **Dépassement CS → calendrier** (`nextCSDate`/`lastCSDate`) plutôt qu'une saisie.
9. **Contrat de gestion vs app externe** `contratscopro.real31.app`.

---

## 5. Pièges de données (vérifiés sur les vraies données — ne pas refaire l'erreur)

- **`Copropriete.csDurationMinutes` contient des HEURES** malgré son nom (265 copros,
  valeurs 0/1/2/3). Diviser par 60 ferait facturer presque toute réunion de CS en totalité.
- **`Copropriete.realPostalFees` est un BOOLÉEN** (frais réels vs forfait), pas un montant.
- **`Copropriete.pennylaneId` est une `external_reference`** (UUID), PAS l'`id` interne
  Pennylane. L'adapter résout en 2 appels.
- **`analytics.revenue_entry`** contient le CA facturé mais `copropriete_id` souvent NULL
  (matching non fiable) : NON utilisé, on est passé par la liste SharePoint « Suivi des contrats copro ».
- Le champ **`description` d'une ligne Pennylane s'affiche sur le PDF** ; `label` en est le titre.
- Payload Pennylane : `deadline`, `currency`, `language` exigés (400 NotAnyOf sinon) ;
  `vat_rate` = `"FR_200"` / `"exempt"` ; `pdf_invoice_free_text` = code entité ;
  `pdf_invoice_subject` = objet ; `product_id` + `ledger_account_id` = rattachement compta.

---

## 6. Limites connues / dette

1. **`special_mention` NON porté** : le legacy l'envoie pour suivi travaux et sinistre. Absent.
2. **PostgREST sans transaction multi-tables** : si l'insert des lignes échoue après la
   facture, la facture reste sans ligne (erreur remontée). À durcir en RPC si besoin.
3. **Mail comptable** bloqué (Entra ID / Graph DSI).
4. **Contrat de syndic** (génération document/PDF) bloqué ADR-012. Seul le calcul de durée est porté.
5. **Grille tarifaire 2024 incomplète** (seulement `TauxHoraire`) : 11 copros lèveront une
   erreur sur les autres prestations. 4 d'entre elles ont un `syndicContractEndDate` périmé (App A).
6. **ASN sans produit** dans la liste Produits (mais 0 copro active sur ASN).
7. **Brouillon Pennylane `26267486445568`** (suivi travaux S046 « ML », créé le 2026-07-22)
   **qui n'est pas de ce code** : soit le PowerApps legacy tourne encore en parallèle
   (⚠️ **risque de double facturation** à la bascule), soit c'est une vraie facture. À trancher.
8. **Sous-détail de ligne sur le PDF gestion courante** (« ...- 2026-T3 ») : présent chez
   nous, absent de la vraie facture. Cosmétique, décision en attente de Sekou.

---

## 7. Données sensibles dans le repo (à trancher)

- `data/` (non suivi) contient les **CSV exports réels** : Tarifs, Suivi des contrats
  (honoraires par copro), Produits. **Ne devraient probablement PAS être commités.**
- Les seeds SQL `intranet_suivi_contrats_seed_reel.sql`, `intranet_tarifs_seed.sql`,
  `intranet_produits.sql` **contiennent les montants réels + les comptes comptables +
  les product_id Pennylane**. À décider : commit (repo autosuffisant) ou gitignore ?
  Le README du repo dit « aucun secret/credential » — ce ne sont pas des credentials,
  mais des données financières sensibles.

---

## 8. État git (au 2026-07-23)

- **Rien de ce module n'est commité.** ~15 fichiers modifiés + ~10 nouveaux (voir
  `git status`), plus les 8 SQL et les 3 CSV.
- `src/lib/adapters/router.ts` a été démêlé (le chantier eStale-live y a été commité
  par la session parallèle) : il ne contient plus que le câblage facturation/recap/gestion.
- **Convention de commit** : ton humain, français, `type(scope): ...`, **aucun marqueur
  IA** (cf. l'historique). Découpage atomique suggéré : schéma/seeds, backend
  (domaine+ports+adapters+services), UI, par module.

---

## Sources
- Audit legacy : `mythec-refactor/powerapps/INVENTORY.md`, `MIGRATION_PLAN.md`.
- ADR-032 dans `DECISIONS.md` (décisions structurantes + pièges de données).
- Passation précédente : `docs/handoff-facturation-recap-ag.md` (antérieure à la
  gestion courante et à la reprise Produits ; ce document-ci la remplace).
