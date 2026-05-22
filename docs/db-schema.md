# Schema BDD - REAL31 Intranet

Ce document decrit la structure de la base de donnees Supabase utilisee par
l'intranet. Source de verite : les fichiers SQL dans `supabase/migrations/`.

## Vue d'ensemble

11 tables organisees en 4 zones :

1. **Identite / permissions** : `users`, `cabinet_settings`
2. **Donnees metier referentiel** (souvent sourcees externe) : `copros`, `evenements`
3. **Donnees metier natives intranet** : `jalons`, `item_odj`, `membres_cs`, `presence_pre_ag`
4. **Logs et observabilite** : `audit_log`, `activity_log`, `job_runs`

## Diagramme des relations

```
                          +----------------------+
                          |  cabinet_settings    |
                          |  (key/value JSONB)   |   <-- seed des jalons REAL31
                          +----------------------+

  +-----------+        +----------------------+        +-----------------+
  |  users    |<-+     |       copros         |---+    |   membres_cs    |
  |           |  |     |                      |   |    |                 |
  | id        |  |     | id                   |   +--->| copro_id (FK)   |
  | email     |  |     | source ('sharepoint' |        | nom, role       |
  | role      |  |     |  |'estale'|'native') |        +-----------------+
  | gestion_  |  |     | source_id            |
  |  initials |  |     | gestionnaire_initials|        +-----------------+
  +-----------+  |     +----------+-----------+        | presence_pre_ag |
        ^        |                |                    |                 |
        |        |                | 1:N                |  unique evt_id  |
        |        |                v                    +--------+--------+
        |        |     +----------------------+                 |
        |        |     |      evenements      |<----------------+
        |        |     |                      |                 |
        |        |     | id                   |                 |
        |        |     | source ('share|esta  |                 |
        |        |     |  |native')           |     +-----------------+
        |        |     | copro_id (FK)        |---->| jalons          |
        |        |     | type (AG|AGE|CS|     | 1:N |                 |
        |        |     |       VISITE|TRAVAUX)|     | type (ODJ_CS|   |
        |        |     | statut, date_evt     |     |  DEVIS|CONVOC|  |
        |        |     +----------+-----------+     |  POUVOIRS|TENUE)|
        |        |                |                 | cible_date      |
        |        |                | 1:N             | statut          |
        |        |                v                 | marque_par (FK) |--+
        |        |     +----------------------+     +-----------------+  |
        |        |     |       item_odj       |                          |
        |        |     |                      |                          |
        |        |     | evenement_id (FK)    |                          |
        |        |     | ordre, libelle       |                          |
        |        |     | regle_majorite       |     +-----------------+  |
        |        |     +----------------------+     |  activity_log   |  |
        |        |                                  |  (UI feature)   |  |
        |        +--------------------------------->| actor_user_id   |  |
        |                                           | resource_type,  |  |
        |              +----------------------+     |  resource_id    |  |
        +--------------|     audit_log        |     | action_code     |  |
                       |  (RGPD, jamais UI)   |     +-----------------+  |
                       |                      |                          |
                       | actor_user_id (FK)   |<-------------------------+
                       | action, resource     |
                       +----------------------+

                       +----------------------+
                       |      job_runs        |   (logs cron, autonome)
                       | job_name, status     |
                       +----------------------+
```

## Choix de conception non triviaux

### Une seule table `evenements` pour 3 sources

`source IN ('sharepoint', 'estale', 'native')` est le **discriminateur unique**
porte par chaque ligne. Le routeur d'adapters lit cette colonne pour decider
quel adapter appeler (cf. ADR-001 et ADR-003).

L'alternative aurait ete d'avoir 3 tables `evenements_sharepoint`,
`evenements_estale`, `evenements_native` avec une vue d'union par-dessus.
Trop verbeux pour le benefice : la moitie des colonnes seraient identiques
et les jointures avec `jalons`, `item_odj`, `presence_pre_ag` deviendraient
penibles (UNION partout).

La contrainte `UNIQUE (source, source_id)` garantit qu'une copro / evenement
sourcee externe est unique en croisant la source ET l'identifiant externe
(deux sources peuvent avoir le meme ID sans collision).

### Soft delete via `archived_at`

Les tables referentiels (`copros`, `evenements`) utilisent un soft delete
plutot qu'un DELETE physique :

- Preserve l'historique pour l'audit (RGPD).
- Conserve les FK depuis `jalons`, `activity_log`, `audit_log`.
- Permet de reactiver une copro archivee par erreur.

Les jobs de sync respectent ce soft delete : ils mettent `archived_at` si
une copro disparait de la source, plutot que de la supprimer physiquement.

### Deux tables de log : `audit_log` et `activity_log`

Separation deliberee (cf. ADR-007) :

| Table          | Usage             | Acces UI            | Volume     |
| -------------- | ----------------- | ------------------- | ---------- |
| `audit_log`    | Conformite RGPD   | Admin seulement     | Tres haut  |
| `activity_log` | Feature produit   | User-facing via UI  | Moyen      |

`audit_log` capture toutes les modifications + les lectures de donnees
sensibles (coordonnees, donnees financieres). Append-only, jamais en SELECT
depuis l'app utilisateur. Politique de purge automatique au-dela de la
duree de conservation (a definir avec DPO).

`activity_log` capture les actions metier user-meaningful (ex: "FS a marque
les convocations comme envoyees"). Affichee dans l'UI "Historique des
actions" sur une fiche AG / copro. Le payload JSONB stocke les libelles
deja serialises pour eviter d'avoir a rejoindre d'autres tables au moment
de l'affichage.

Le helper applicatif `withAudit()` (a coder en Increment 4) ecrit dans
les deux tables en une seule transaction quand applicable.

### Pas de RLS dans cette migration

L'activation de la Row-Level Security (cf. ADR-011) arrive dans la
migration suivante (`002_rls_initial.sql` a creer en Increment 5).
Raisons :

- Plus simple de valider la structure des tables d'abord (Increment 2),
  puis d'ajouter la politique de cloisonnement par gestionnaire ensuite
  (Increment 5).
- La RLS sans utilisateurs reels ni `auth.uid()` cote serveur ne sert a
  rien. On attend que le module auth (Increment 3) soit cable avant
  d'activer la RLS.

### Index partiels

Plusieurs index utilisent une clause `WHERE` :

- `copros_gestionnaire_idx WHERE archived_at IS NULL` : on ne cherche
  presque jamais les copros archivees.
- `jalons_cible_date_idx WHERE statut = 'a_faire'` : les alertes ne
  s'interessent qu'aux jalons non encore faits.
- `job_runs_status_idx WHERE status != 'success'` : on cherche les runs
  en erreur, les succes sont consultes en bloc differemment.

Les index partiels reduisent la taille de l'index et accelerent les
requetes les plus frequentes.

## Workflow de migration

Migrations versionnees dans `supabase/migrations/`. Convention de nommage :
`YYYYMMDDHHMMSS_description.sql` (timestamp UTC, format attendu par le CLI).

Commandes :

| Script              | Effet                                                     |
| ------------------- | --------------------------------------------------------- |
| `pnpm db:push`      | Applique les migrations en attente vers le projet lie     |
| `pnpm db:diff`      | Diff entre les migrations locales et le schema distant    |
| `pnpm db:types`     | Regenere `src/types/database.ts` depuis le schema distant |
| `pnpm db:reset`     | Reset la BDD locale Docker (sans toucher au cloud)        |

Pour reseter le cloud (DESTRUCTIF, jamais en prod) : `pnpm supabase db reset --linked`.

## A retenir avant d'ajouter une table

1. **Naming** : snake_case en SQL, jamais d'accent dans le nom des tables / colonnes.
2. **Updated_at** : si la table doit etre mutable, prevoir un trigger
   `set_updated_at` (helper deja defini).
3. **Soft delete** : reserver `archived_at` aux tables referentiels lourds.
   Les tables techniques (logs) ne se "soft deletent" pas, elles s'archivent
   par batch.
4. **FK on delete** :
   - `cascade` pour les enfants techniques d'une entite (jalons d'un evenement,
     presence d'un evenement).
   - `set null` pour les references "informationnelles" (audit_log.actor_user_id,
     jalons.marque_par_user_id) qui doivent survivre a la suppression.
5. **RLS** : ajouter la policy dans une migration dediee, jamais melangee a
   la definition des tables.
