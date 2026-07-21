# Reprise du chantier Facturation / Récap AG

Prompt de passation pour la session Claude Code qui reprend ce chantier.
Rédigé le 2026-07-21 par la session qui a porté le module depuis PowerApps.

---

## Ta mission

Deux modules viennent d'être portés depuis la solution PowerApps `MYTHEC_REAL31_Automation`
(**Facturation des honoraires syndic** et **Récap AG**). Ils fonctionnent et sont testés, mais
ils ont été construits **en vase clos**, sans connaissance fine des modules que tu as déjà
développés dans cet intranet.

**Analyse ce code, puis propose comment l'intégrer au reste de l'intranet.** Ne te contente pas
de le laisser à côté : cherche les endroits où il devrait se brancher sur l'existant, et les
doublons qu'il crée peut-être sans le savoir.

L'exemple de Sekou : quand on saisit des **travaux votés** dans un récap AG, il faudrait sans
doute créer en même temps un **dossier travaux** dans l'intranet, plutôt que de laisser cette
information isolée dans `intranet_recap_ag_travaux`. Mais ce n'est qu'un exemple parmi d'autres,
cherches-en d'autres.

---

## Ce qui a été construit

### Schéma (tables natives `public.intranet_*`, déjà en base)

| Table | Rôle |
|---|---|
| `intranet_tarifs` | Grille tarifaire annuelle TTC (47 lignes, 2024-2026) |
| `intranet_suivi_contrats` | Cycles de contrat de gestion par copro (250 lignes) |
| `intranet_factures` + `intranet_facture_lignes` | Factures à émettre et leurs lignes |
| `intranet_recap_ag` + `intranet_recap_ag_travaux` | Compte-rendu d'AG et travaux votés |

SQL dans `supabase/sql/intranet_facturation.sql`, `intranet_recap_ag.sql`,
`intranet_tarifs_seed.sql`, `intranet_suivi_contrats_seed.sql`,
`intranet_recap_ag_complements.sql`. Tous déjà exécutés.

### Code

- **Domaine pur** (`src/lib/domain/facturation/`, `src/lib/domain/contrat/`,
  `src/lib/domain/recap-ag/`) : calculs de dépassement CS et AG, honoraires travaux et
  sinistre, durée de contrat, règle du fonds travaux. Sans Zod ni `Date`, entièrement testé.
- **Ports** : `facturation-repository`, `recap-ag-repository`, `invoicing-provider`.
- **Adapters** : Supabase et mock pour chaque port, plus `adapters/pennylane/` (API externe v2).
- **Services** (`src/lib/services/facturation/`) : 5 prestations + récap AG, chacune avec un
  `apercuXxx` (calcul sans écriture) et un `creerXxx`, qui partagent le même calcul.
- **UI** : `/facturation` et `/recap-ag`, avec un écran de validation commun
  (`ApercuFacturation`) et un historique.

Vérification : `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Tout est vert.
Un smoke manuel réel existe : `corepack pnpm run test:smoke facturation-e2e` (crée un vrai
brouillon Pennylane, à ne lancer qu'en connaissance de cause).

---

## Pistes d'intégration à examiner

Voici ce que j'ai repéré sans avoir le temps de creuser. À toi de valider, compléter, écarter.

1. **Travaux votés en AG -> dossier travaux** (piste de Sekou). `intranet_recap_ag_travaux`
   stocke libellé, budget, clé de répartition, modalités d'appel de fonds et numéro de
   résolution. Le module `dossiers` (`intranet_dossiers`) existe déjà. Faut-il créer un dossier
   par poste de travaux ? Le lier ? Fusionner les deux modèles ?

2. **Numéro de résolution -> module Résolutions / ODJ**. Je viens d'ajouter un champ texte libre
   `numero_resolution` sur les travaux. Or il existe un module ODJ (`intranet_odj_champs`) et un
   module Résolutions. Ce numéro devrait probablement **référencer une vraie résolution** plutôt
   qu'être saisi à la main.

3. **Facturation suivi de sinistre -> module Sinistre**. L'écran demande aujourd'hui un
   « libellé du sinistre » en texte libre. Le module `/sinistre` gère de vrais dossiers
   (`intranet_sinistres`). La facturation devrait sans doute **sélectionner un sinistre
   existant** et s'y rattacher.

4. **Récap AG -> supervision AG**. Il existe déjà `conclureAg(agId, visa)` dans
   `services/supervision-ag`. Sekou a tranché (2026-07-08) que le récap serait une **couche
   autonome**, mais deux notions de « fin d'AG » coexistent maintenant. À réexaminer avec le
   recul de ce que tu as construit depuis.

5. **Récap AG -> jalons post-AG**. `domain/jalons-ag/calculator.ts` calcule des jalons
   post-AG (`SCAN_CONTRAT`, `NOTIF_PV`, `ARCHIVAGE`). Enregistrer un récap pourrait en marquer
   certains automatiquement.

6. **Récap AG -> dates de copropriété**. Une AG tenue devrait mettre à jour `lastAGDate` et
   `nextAGDate`. Attention : tu travailles justement sur `CoproDatesRepository` et l'eStale-live,
   c'est probablement ton terrain, pas le mien.

7. **Notification comptable**. Le flow legacy `NotifComptable` envoyait un mail au comptable
   après l'AG. Bloqué par Entra ID (DSI). Mais il existe un module compta avec
   `intranet_compta_notes` : une **note automatique** y serait peut-être un substitut utile en
   attendant le mail.

8. **Dépassement CS -> calendrier**. La date et les heures de la réunion CS sont saisies à la
   main. Le module calendrier connaît les CS (`nextCSDate`, `lastCSDate`). La facturation
   pourrait partir d'un événement plutôt que d'une saisie.

9. **Contrat de gestion**. Le récap AG ouvre un cycle dans `intranet_suivi_contrats`. Il existe
   une app externe `contratscopro.real31.app` (onglet Contrats de la fiche copro). Recoupement à
   vérifier.

---

## Décisions déjà prises (ne pas défaire sans en parler à Sekou)

- **`Tarifs` contient du TTC**, le HT facturé vaut TTC / 1,2. Confirmé par Sekou et corroboré
  par les données (plusieurs tarifs donnent un HT rond).
- **Le montant n'est jamais saisi**, sauf pour le pré-état daté et l'état daté qui **se
  négocient** : là il est pré-rempli au barème et modifiable, la négociation est tracée en base
  mais **n'apparaît pas sur le PDF client** (décision Sekou du 2026-07-21).
- **`draft: true` non négociable** : aucune facture n'est jamais finalisée automatiquement.
- **Un tarif absent du barème lève une erreur explicite** (le legacy le comptait 0 en silence).
- **Le fonds travaux sous 5 % avertit sans bloquer** (décision Sekou du 2026-07-21).
- **Le récap AG est une couche autonome**, indépendante de `conclureAg` (décision du 2026-07-08,
  mais voir piste 4).
- **Pas d'écriture dans `public."Copropriete"`** (table Prisma de l'App A) : référence logique
  uniquement. Le legacy y écrivait `ppt`, je ne l'ai pas reproduit.

---

## Pièges de données (vérifiés sur les vraies données, ne pas refaire l'erreur)

- **`Copropriete.csDurationMinutes` contient des HEURES**, malgré son nom. Relevé sur les
  265 copros : valeurs 0/1/2/3. Diviser par 60 ferait facturer presque toute réunion de CS en
  totalité.
- **`Copropriete.realPostalFees` est un BOOLÉEN** (frais réels vs forfait), pas un montant.
- **`Copropriete.pennylaneId` est une `external_reference`** (UUID), pas l'`id` interne
  Pennylane. L'adapter fait une résolution en deux appels.
- Le champ **`description` d'une ligne Pennylane est ce qui s'affiche sur le PDF** ;
  `label` en est le titre court.
- Le schéma Pennylane « Draft Customer Invoice » exige `deadline`, `currency`, `language`.

---

## Reste à faire

1. **`special_mention`** : le legacy l'envoie à Pennylane pour le suivi de travaux et de
   sinistre. Pas encore porté.
2. **Facturation de gestion courante trimestrielle** : bloquée, les honoraires annuels et le
   forfait postaux n'existent nulle part dans `Copropriete` (`realPostalFees` est un booléen).
   Il faudrait reprendre la liste SharePoint « Suivi des contrats copro ».
3. **Grille tarifaire 2024 incomplète** (seulement `TauxHoraire`) : 11 copropriétés ont un
   contrat antérieur à 2025 et lèveront une erreur sur les autres prestations.
4. **Produits Pennylane non repris** (`product_id`, `ledger_account_id` par agence) : les lignes
   partent sans rattachement au plan comptable. À évaluer avec la compta.
5. **Deux brouillons de test** traînent dans le Pennylane de production
   (`26132849094656` et `26133279850496`, client SDC 136 RUE PAUL DEROULEDE, 380 € chacun).
6. **Génération du contrat de syndic** : le calcul de durée est porté
   (`domain/contrat/duree-contrat.ts`), le reste est du publipostage. Bloqué par ADR-012 (PDF).

---

## Attention, état du dépôt

Au moment de cette passation :

- Le module **Récap AG n'est PAS commité** : `src/app/recap-ag/`, `src/components/recap-ag/`,
  `src/lib/ports/recap-ag-repository.ts`, les adapters recap-ag, `src/lib/domain/recap-ag/`,
  `src/lib/services/facturation/creer-recap-ag.ts`, `supabase/sql/intranet_recap_ag_complements.sql`
  et la modification de `src/components/layout/sidebar.tsx`.
- **`src/lib/adapters/router.ts` est mélangé** : il contient 6 lignes de câblage recap-ag
  (`getRecapAgRepository`) **et** environ 12 lignes d'un chantier eStale-live qui n'est pas de
  moi (`CompositeCoproRepository`, `estaleLiveActif`, `CoproDatesRepository`). Je n'ai
  volontairement pas commité ce fichier pour ne pas embarquer ton travail en cours.
- D'autres fichiers non suivis ne sont pas de moi non plus : `adapters/composite/`,
  `estale-copro-provider.ts`, `supabase-copro-dates-repository.ts`, `router-copro.test.ts`,
  ainsi que `eslint.config.mjs` et `domain/copropriete.ts` modifiés.

**Commence donc par démêler ça** avec Sekou avant de construire par-dessus.

---

## Sources

- Audit complet du legacy : dépôt voisin `mythec-refactor`, fichiers
  `powerapps/INVENTORY.md` et `powerapps/MIGRATION_PLAN.md` (analyse fonctionnelle, décisions
  métier, points ouverts).
- Office Script de génération du contrat : `powerapps/office-scripts/ContratReplace.ts`.
- ADR : **ADR-032** dans `DECISIONS.md` (décisions structurantes et pièges de données).
- ROADMAP : section « Migration des automatisations MYTHEC ».
