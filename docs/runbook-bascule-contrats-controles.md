# Runbook : bascule « Contrats & contrôles » (REA-333)

Ce qui se fait à la main, dans l'ordre, pour mettre le module en service et éteindre l'ancienne application `contratscopro.real31.app`. Le code est sur la branche `chantier/contrats-controles` (ADR-048, plan `docs/plan-integration-suivi-contrats-copros.md`).

## 1. Avant le merge : SQL (éditeur Supabase, base partagée, Sekou)

Dans cet ordre, chacun rejouable :

1. `supabase/sql/intranet_contrats_controles.sql` : journal immuable, colonnes `metiers` / `courtier_partenaire` sur `intranet_cles_entreprise`, table `intranet_copro_prestataire`.
2. `supabase/sql/intranet_contrats_offres_suppression_logique.sql` : `deletedAt` / `deletedById` sur `InsuranceOffer`, `GasOffer`, `CtqQuote` (tables Prisma de l'ancienne appli : elle ne doit plus recevoir de migration ensuite).
3. `supabase/sql/intranet_contrats_modeles_mail_seed.sql` : les 6 modèles de mail au conseil syndical.

Puis cocher les trois lignes dans `supabase/sql/EXECUTES.md`. Contrôle : `select count(*) from public.intranet_contrats_journal;` répond 0 (et pas une erreur « relation inexistante »).

Sans ces SQL l'intranet tourne : l'onglet lit et affiche, mais tout geste d'écriture sur le journal ou les prestataires échoue avec un message clair, les suppressions d'offres repartent en suppression dure, et le mail au CS propose un texte de secours.

## 2. Reprise des prestataires (après le SQL 1)

```bash
node --env-file=.env.local scripts/contrats-reprendre-prestataires.mjs            # dry-run : relire le rapport
node --env-file=.env.local scripts/contrats-reprendre-prestataires.mjs --commit   # écrit
```

Mesuré le 16/10/2026 : 30 entreprises à créer, 7 à enrichir, 152 liens copro-ascensoriste. Cinq quasi-doublons à fusionner ensuite à la main dans `/cles/entreprises` (CEPA, LMT, MISTRAL, Paris Tronchet, SCHINDLER).

## 3. Recette sur SE999 (copro de test, jamais une vraie)

Depuis la fiche de SE999, onglet Contrats : dater une étape, l'effacer, clôturer un cycle gaz avec une offre, vérifier que le contrat courant a hérité de l'offre, déposer un document (si `SHAREPOINT_DEPOT_ACTIF=1`), préparer un mail au CS sans l'envoyer, puis l'envoyer vers une adresse interne. Vérifier le journal en bas de l'onglet.

Audit des échéances douteuses (lecture seule) :

```bash
node --env-file=.env.local scripts/contrats-audit-echeances.mjs --csv echeances.csv
```

Au 16/10 : 44 cycles, 42 copros, 11 gestionnaires. À nettoyer via l'onglet « À compléter » avant d'armer le moindre rappel.

## 4. Prévenir, puis figer l'ancienne application (étape 2 du plan)

1. Prévenir Emmanuel (auteur et utilisateur quotidien) et les gestionnaires actifs : Mathilde, Fanny, Chrystelle, Nicolas, Mahaut, Titouan, Océane, Julie, Galiano. Fiche process sur l'extranet, comme pour toute mise en production (règle du 14/10).
2. Passer l'ancienne application en lecture seule. Le plus simple côté `Suivi-contrats-Copros-main` : dans `lib/coproprietes/canWrite.ts`, faire renvoyer `false` à `canWriteCopro` quand `process.env.LECTURE_SEULE === "1"`, poser la variable sur son Vercel, redéployer. Tous les écrans restent consultables, plus aucune écriture ne passe (les routes PATCH répondent 403).
3. Ne plus jamais lancer `prisma migrate` sur la base depuis l'ancienne appli.

## 5. Variables d'environnement (Vercel de l'intranet)

| Variable | Rôle | Valeur de départ |
|---|---|---|
| `CONTRATS_RAPPELS_SUJETS` | sujets pour lesquels le cron envoie un mail hebdomadaire au binôme (`assurance,gaz,ctq_ascenseur,ctq_vmc`) | absente (rien ne part) ; armer un sujet à la fois, après nettoyage des dates |
| `SHAREPOINT_DEPOT_ACTIF` | dépôt des documents dans SharePoint (déjà utilisée par le contrat de syndic) | selon l'état du droit Sites.Selected |
| `INTRANET_URL` | lien de la fiche dans les mails de rappel | `https://real31.app` |

Le cron `/api/cron/echeances-contrats` (5 h 30) est déclaré dans `vercel.json` ; il répond un bilan JSON et n'envoie rien sans sujet armé. Les seuils se règlent dans `/admin/relances`.

## 6. Extinction (étape 7 du plan)

Quand plus personne n'ouvre l'ancienne application : couper son déploiement Vercel, puis, par SQL et avec Sekou, supprimer `Session`, `MagicLinkToken`, `Notification`, `EmailTemplate`, `Contact`, `BuildingContact`, `CtqRemediationItem`, `_prisma_migrations`. `AuditLog` reste en archive. Les colonnes `alertLevel`, `lastReminderSentAt`, `searchNormalized` peuvent tomber au même moment.
