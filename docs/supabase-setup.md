# Supabase setup - branchement du projet mutualise

Procedure a suivre **avant** le premier `pnpm db:push`. Le projet Supabase
est celui du patron (mutualisation actee, cf. ADR-021). L'intranet vit
dans le schema dedie `real31_intranet`, jamais dans `public` (qui sert
l'app A Prisma/PascalCase).

Cette procedure est a faire une seule fois par machine de dev.

---

## 1. Recuperer les credentials dans le dashboard Supabase

Aller sur https://supabase.com/dashboard et ouvrir le projet du patron.

- **Settings -> General** : noter le **Project Ref** (20 caracteres, format
  `xxxxxxxxxxxxxxxxxxxx`).
- **Settings -> API -> Project URL** : noter (`https://<ref>.supabase.co`).
- **Settings -> API -> Project API keys** :
  - copier `anon` `public` key (visible).
  - copier `service_role` `secret` key (cliquer "Reveal" - sensible, ne
    jamais commit).
- **Settings -> API -> Data API -> Exposed schemas** : ajouter `real31_intranet`
  a la liste a cote de `public` et `graphql_public`. **Sauvegarder.**
  > Sans cette etape, PostgREST renvoie `schema not found` malgre les
  > grants poses dans la migration.
- **Settings -> Database -> Connection string** : noter le password de la
  BDD (sera demande par `supabase link`).

## 2. Linker le CLI Supabase au projet du patron

Dans le terminal a la racine du repo :

```powershell
# Si un projet Supabase precedent etait linke (cas projet REAL31 standalone
# abandonne), le delier d'abord.
supabase projects list           # colonne LINKED indique l'attachement
supabase unlink                  # uniquement si LINKED pointe vers un autre projet

# Login Supabase (browser-based) si pas deja fait.
supabase login

# Linkage au projet du patron.
supabase link --project-ref <REF_NOTÉE_ETAPE_1>
# -> te demandera le password BDD note a l'etape 1.
```

Verification :

```powershell
supabase migration list --linked
```

- Les migrations remote du patron (sur `public`, Prisma) peuvent apparaitre :
  c'est normal, on ne les touche pas.
- Nos deux migrations (`20260522170000_initial_schema.sql`,
  `20260601120000_enable_rls.sql`) doivent apparaitre en `local only` -
  c'est ce qu'on s'apprete a pousser.

## 3. Creer `.env.local`

A la racine du projet, creer `.env.local` (deja gitignore par Next) en
copiant `.env.example` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
```

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` ne doit JAMAIS etre prefixe
> `NEXT_PUBLIC_`** : ca exposerait la cle au browser et casserait
> entierement la RLS.

## 4. Valider explicitement avant le `db push`

Une fois les 3 etapes ci-dessus faites, dire **explicitement** "go db
push" dans la conversation. La commande sera alors lancee :

```powershell
pnpm db:push
```

Action **irreversible** : applique les deux migrations sur le cloud du
patron (le schema `real31_intranet` est cree avec toutes les tables, les
seeds cabinet_settings et la RLS).

Apres succes :

```powershell
pnpm db:types     # codegen TypeScript -> src/types/database.ts
pnpm dev          # ouvrir /dev/db-health pour valider la connexion
```

---

## Notes de securite

- Le schema `real31_intranet` est **strictement isole** du `public` du
  patron. Aucune migration de l'intranet ne touche `public`.
- Le helper `set_updated_at()` est qualifie dans `real31_intranet`, pas
  dans `public`.
- La RLS est activee partout des la migration 2 (cf. ADR-011), mais
  l'absence d'auth Supabase reelle au MVP fait que `auth.uid()` retourne
  NULL : tous les acces user-facing renvoient 0 ligne tant que l'auth
  n'est pas branchee (Increment 3 mock auth, puis J1b Entra ID). En
  attendant, l'app passe par le client `service_role` qui bypass la RLS.
  Documente dans le header de la migration RLS.

## En cas de probleme

- **`schema "real31_intranet" not found`** cote API : Exposed schemas
  pas mis a jour cote dashboard (etape 1). Refaire et resauvegarder.
- **`permission denied for schema real31_intranet`** : grants pas
  appliques. Verifier que la migration `20260522170000_initial_schema.sql`
  est bien en bas (apres les `create table`).
- **`new row violates row-level security policy`** : auth.uid() est NULL
  cote service. Soit utiliser le client `admin` (service_role), soit
  attendre Increment 3.
- **Linkage Supabase casse** : `supabase unlink` puis `supabase link
  --project-ref ...` a nouveau.
