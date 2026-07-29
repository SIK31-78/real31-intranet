// =============================================================================
// MODELE DE ROLES DE L'INTRANET - LA reference (point de verite unique).
// =============================================================================
//
// Module PUR (aucune dependance next-auth, aucune I/O) -> testable offline et importable
// partout : session, AppShell, pages server, Server Actions, routes API.
//
// LES ROLES
//   - gestionnaire : le DEFAUT. Tout collaborateur authentifie l'est, sans aucune allowlist.
//                    Il voit son portefeuille (cloisonnement par managerId) et le SUIVI des
//                    modules transverses.
//   - comptable    : le pole comptable du cabinet. Transverse : PAS de portefeuille, il voit
//                    TOUTES les copros via /comptabilite.
//   - manager      : encadrement de proximite. Pilote les chantiers d'onboarding (reprise).
//   - directeur    : direction du cabinet. Memes droits que manager (+ tout ce qui viendra).
//   - super_admin  : Sekou / l'admin technique. IMPLIQUE TOUS LES AUTRES ROLES (il doit pouvoir
//                    tester n'importe quel ecran sans se rajouter dans 4 allowlists).
//
// LE CUMUL est la regle : un email peut porter plusieurs roles (un directeur peut aussi etre
// dans COMPTABLES). `rolesDe` renvoie l'ENSEMBLE des roles portes, jamais "le" role.
//
// LES SOURCES = des allowlists d'emails dans l'env (CSV, meme pattern que l'existant). AUCUN
// email n'est ecrit en dur ici. Deux graphies sont acceptees par role - le PLURIEL est la forme
// RECOMMANDEE (coherente avec SUPER_ADMINS / COMPTABLES deja en place), le singulier est tolere
// pour ne pas pieger celui qui pose la variable :
//
//   DIRECTEURS=... (ou DIRECTEUR=)      -> role directeur
//   MANAGERS=...   (ou MANAGER=)        -> role manager
//   COMPTABLES=... (ou COMPTABLE=)      -> role comptable
//   SUPER_ADMINS=...(ou SUPER_ADMIN=)   -> role super_admin
//
// Format : emails separes par des virgules, casse et espaces indifferents.
//   DIRECTEURS=jean.dupont@real31.fr, marie.martin@real31.fr
// Les deux graphies sont CUMULEES (l'union), jamais l'une a la place de l'autre.
//
// LA REGLE D'USAGE : l'UI et les gardes serveur testent une INTENTION METIER
// (`estAdminReprise`, `peutVoirComptabilite`), JAMAIS un role brut. Quand le decoupage bouge,
// on change le helper ici, pas 30 ecrans.
//
// Les variables se posent en local (.env.local) ET sur Vercel (Settings > Environment
// Variables, scope Production). Une variable absente = personne n'a le role (jamais une
// ouverture par defaut) - sauf `gestionnaire`, qui n'a pas d'allowlist par construction.

/** Les roles connus de l'intranet. `gestionnaire` est le defaut (aucune allowlist). */
export const ROLES = ["gestionnaire", "comptable", "manager", "directeur", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

/** Roles portes par une allowlist d'env (tous sauf le defaut `gestionnaire`). */
const ROLES_ALLOWLISTES = ["comptable", "manager", "directeur", "super_admin"] as const;
type RoleAllowliste = (typeof ROLES_ALLOWLISTES)[number];

/** Variables d'env par role : [forme recommandee (pluriel), forme toleree (singulier)]. */
const SOURCES_ENV: Record<RoleAllowliste, readonly [string, string]> = {
  comptable: ["COMPTABLES", "COMPTABLE"],
  manager: ["MANAGERS", "MANAGER"],
  directeur: ["DIRECTEURS", "DIRECTEUR"],
  super_admin: ["SUPER_ADMINS", "SUPER_ADMIN"],
};

/** Emails d'une allowlist CSV, normalises (trim + minuscules). */
function allowlist(csv: string | undefined): string[] {
  return (csv ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * L'email est-il dans l'allowlist du role ? Union des deux graphies (pluriel + singulier).
 * Lu a CHAQUE appel (pas au chargement du module) : une variable posee apres coup est prise en
 * compte, et les tests peuvent stubber l'env.
 */
function dansAllowlist(email: string | null | undefined, role: RoleAllowliste): boolean {
  const e = email?.trim().toLowerCase();
  if (!e) return false;
  const [pluriel, singulier] = SOURCES_ENV[role];
  return allowlist(process.env[pluriel]).includes(e) || allowlist(process.env[singulier]).includes(e);
}

/**
 * TOUS les roles portes par cet email. Contient TOUJOURS `gestionnaire` (le defaut : l'appelant
 * ne pose la question que pour une session authentifiee). `super_admin` implique tous les autres.
 */
export function rolesDe(email: string | null | undefined): Set<Role> {
  const roles = new Set<Role>(["gestionnaire"]);
  for (const role of ROLES_ALLOWLISTES) {
    if (dansAllowlist(email, role)) roles.add(role);
  }
  // Le super-admin porte tout : il doit pouvoir ouvrir n'importe quel ecran pour le tester.
  if (roles.has("super_admin")) for (const r of ROLES) roles.add(r);
  return roles;
}

/** Cet email porte-t-il ce role ? (implication super_admin incluse) */
export function aRole(email: string | null | undefined, role: Role): boolean {
  return rolesDe(email).has(role);
}

// --- ROLE PILOTE PAR LA TABLE (public."User".role, enum App A) -----------------
//
// PERIMETRE (decision Sekou, 2026-07-20) : SEUL le role comptable est pilote par la
// table `public."User".role`. On ajoute une ligne role=COMPTABLE dans la base (celle
// qui sert deja d'annuaire a l'intranet) et l'acces comptable s'ouvre SANS
// redeploiement. directeur/manager/super_admin restent sur les allowlists d'env
// ci-dessus. Le module reste PUR : le role brut est PASSE en argument (resolu a la
// session via getGestionnaireCourant), jamais lu ici par une requete DB.

/**
 * Le role brut de public."User".role (enum App A) designe-t-il un comptable ?
 * Seule la valeur COMPTABLE est mappee (comparaison insensible casse/espaces : l'enum
 * App A est en MAJUSCULES). Les autres valeurs (ADMIN, DIRECTEUR_SYNDIC...) ne sont
 * VOLONTAIREMENT pas mappees ici - elles restent hors du perimetre table.
 */
export function estComptableTable(roleTable: string | null | undefined): boolean {
  return (roleTable ?? "").trim().toUpperCase() === "COMPTABLE";
}

// --- ROLES BRUTS (a n'utiliser que pour composer une intention metier) --------

/**
 * Membre du pole comptable - ou super-admin (qui porte tous les roles). DEUX sources
 * cumulees : l'allowlist d'env COMPTABLES (secours, retro-compat) ET le role de la
 * table `public."User".role === COMPTABLE` passe via `roleTable`.
 */
export function estComptable(
  email: string | null | undefined,
  roleTable?: string | null,
): boolean {
  return aRole(email, "comptable") || estComptableTable(roleTable);
}

/**
 * Emails de l'allowlist COMPTABLES (union des deux graphies). Expose parce que le selecteur
 * dev-login doit pouvoir proposer les comptables : ils n'ont PAS de portefeuille, donc ils
 * sont absents de `list()`, et le role `COMPTABLE` n'existe PAS dans la table `User` (les
 * comptables y sont en `AUTRE`, verifie en base le 2026-07-29). Sans cette liste, le
 * selecteur ne les affichait plus du tout - on ne pouvait plus incarner un comptable.
 * Partout ailleurs, `estComptable` unionne deja allowlist ET role table : c'est
 * `listImpersonables` qui etait la seule incoherence.
 */
export function emailsComptables(): string[] {
  const [pluriel, singulier] = SOURCES_ENV.comptable;
  return [...new Set([...allowlist(process.env[pluriel]), ...allowlist(process.env[singulier])])];
}

/** Manager (MANAGERS) - ou super-admin. */
export function estManager(email: string | null | undefined): boolean {
  return aRole(email, "manager");
}

/** Directeur (DIRECTEURS) - ou super-admin. */
export function estDirecteur(email: string | null | undefined): boolean {
  return aRole(email, "directeur");
}

/** Super-admin (SUPER_ADMINS) : admin technique, porte tous les roles. */
export function estSuperAdmin(email: string | null | undefined): boolean {
  return dansAllowlist(email, "super_admin");
}

// --- INTENTIONS METIER (ce que l'UI et les gardes serveur doivent appeler) ----

/**
 * Acces au dashboard comptable (/comptabilite) : le pole compta et les super-admins (pour
 * tester). Un gestionnaire normal n'y a pas acces.
 */
export function peutVoirComptabilite(
  email: string | null | undefined,
  roleTable?: string | null,
): boolean {
  return estComptable(email, roleTable);
}

/**
 * Voir TOUTES les copros (vue transverse, non cloisonnee) plutot que son seul portefeuille :
 * l'ENCADREMENT (directeur, manager), le POLE COMPTA, et le super-admin. Un gestionnaire
 * normal reste cloisonne a ses copros (managerId). Sert a "Toutes les coproprietes" et a la
 * recherche : sans ca, meme un admin ne voyait que son portefeuille (les copros eStale
 * gerees par d'autres, et S297 sans gestionnaire, restaient invisibles).
 */
export function peutVoirToutesLesCopros(
  email: string | null | undefined,
  roleTable?: string | null,
): boolean {
  return (
    estSuperAdmin(email) ||
    estDirecteur(email) ||
    estManager(email) ||
    estComptable(email, roleTable)
  );
}

/**
 * Doit voir la VUE COMPTABLE epuree (home = dashboard comptable, sidebar reduite) ?
 * = comptable, mais PAS un profil qui pilote le reste : super_admin / manager / directeur
 * gardent la vue complete (ils testent/pilotent tout). Un comptable "pur" (Elsa) -> true.
 */
export function estVueComptable(
  email: string | null | undefined,
  roleTable?: string | null,
): boolean {
  return (
    estComptable(email, roleTable) &&
    !estSuperAdmin(email) &&
    !estManager(email) &&
    !estDirecteur(email)
  );
}

/**
 * Page d'accueil selon le role : le comptable PUR va sur son dashboard comptable
 * (/comptabilite), TOUT LE MONDE d'autre (gestionnaire, manager, directeur, super-admin)
 * atterrit sur /accueil - la home unifiee AG + dossiers. Volontairement independant du
 * role au-dela de la garde comptable (decision Sekou : pas de "directeur -> dashboard").
 */
export function pageAccueilPour(
  email: string | null | undefined,
  roleTable?: string | null,
): string {
  return estVueComptable(email, roleTable) ? "/comptabilite" : "/accueil";
}

/**
 * ADMIN du module REPRISE de copro : directeur, manager ou super-admin.
 *
 * Regle metier (Sekou, 2026-07-17) : le SUIVI d'une reprise est ouvert a TOUS les gestionnaires
 * (voir ou en est la reprise de sa copro) ; TOUT LE RESTE - creer un dossier, uploader/analyser
 * les documents, corriger le jeu, injecter dans eStale, piloter les fiches de renseignements,
 * la revue du mapping comptable, archiver/supprimer - est reserve a l'encadrement. Un
 * gestionnaire voit ces actions GRISEES (elles existent, il sait a qui s'adresser).
 */
export function estAdminReprise(email: string | null | undefined): boolean {
  return estDirecteur(email) || estManager(email);
}

/** Message affiche a un non-admin sur une action reservee (UI + refus serveur : meme phrase). */
export const MESSAGE_RESERVE_ADMIN_REPRISE =
  "Action reservee aux directeurs et managers. Tu peux consulter le suivi de ce dossier ; pour agir dessus, rapproche-toi de ton manager.";
