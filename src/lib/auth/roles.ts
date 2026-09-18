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
//   - comptable_entreprise : la comptabilite DU CABINET (pas des copros). Seul role a voir
//                    /gestion-courante (facturation trimestrielle des honoraires). Decision
//                    Sekou 2026-09-14 : Clementine Vigneron + super-admins, personne d'autre,
//                    pas meme le pole compta copros.
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
//   COMPTABLES_ENTREPRISE=... (ou COMPTABLE_ENTREPRISE=) -> role comptable_entreprise
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
export const ROLES = ["gestionnaire", "comptable", "comptable_entreprise", "manager", "directeur", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

/** Roles portes par une allowlist d'env (tous sauf le defaut `gestionnaire`). */
const ROLES_ALLOWLISTES = ["comptable", "comptable_entreprise", "manager", "directeur", "super_admin"] as const;
type RoleAllowliste = (typeof ROLES_ALLOWLISTES)[number];

/** Variables d'env par role : [forme recommandee (pluriel), forme toleree (singulier)]. */
const SOURCES_ENV: Record<RoleAllowliste, readonly [string, string]> = {
  comptable: ["COMPTABLES", "COMPTABLE"],
  comptable_entreprise: ["COMPTABLES_ENTREPRISE", "COMPTABLE_ENTREPRISE"],
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

/** Comptable d'entreprise (COMPTABLES_ENTREPRISE) - ou super-admin. */
export function estComptableEntreprise(email: string | null | undefined): boolean {
  return aRole(email, "comptable_entreprise");
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
 * Acces a la facturation de gestion courante (/gestion-courante) : la comptabilite du
 * CABINET (comptable_entreprise) et les super-admins. Le pole compta des copros n'y a
 * PAS acces : facturer les honoraires du cabinet n'est pas tenir les comptes des copros.
 */
export function peutVoirGestionCourante(email: string | null | undefined): boolean {
  return estComptableEntreprise(email);
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
export function estAdminReprise(qui: Profil | string | null | undefined): boolean {
  const profil: Profil = typeof qui === "string" || qui == null ? { email: qui ?? null } : qui;
  // Le role de la table (ADMIN, DIRECTEUR_*) compte : les allowlists d'env ne sont qu'un secours.
  return estDirection(profil) || estDirecteur(profil.email) || estManager(profil.email);
}

/** Message affiche a un non-admin sur une action reservee (UI + refus serveur : meme phrase). */
export const MESSAGE_RESERVE_ADMIN_REPRISE =
  "Action reservee aux directeurs et managers. Tu peux consulter le suivi de ce dossier ; pour agir dessus, rapproche-toi de ton manager.";

// =============================================================================
// ROLES PILOTES PAR LA TABLE public."User".role (extension du 16/09/2026, Sekou)
// =============================================================================
//
// Depuis l'organigramme du 16/09, la table App A est LA source des roles du cabinet :
// ADMIN (direction : Emmanuel, Lea L., Sekou), DIRECTEUR_SYNDIC (Sandy a LGC, Dimitri a ML),
// DIRECTEUR_AGENCE (Sandrine a ML), GESTIONNAIRE, ASSISTANT, COMPTABLE, GESTIONNAIRE_LOCATIVE,
// AUTRE (vente, location, accueil). Les allowlists d'env ci-dessus restent un SECOURS
// (union), a vider une fois la table verifiee.
//
// Ce que la table ne sait pas dire vit dans les HABILITATIONS intranet (table
// intranet_habilitation, passees ici en argument, ex. "referent_syndic:HLS" : Titouan, de ML,
// est le referent syndic de Houilles qui n'a pas de directeur).
//
// LA REGLE METIER (Sekou, 16/09/2026) : « ce ne sont que les directeurs qui font des offres ».
// Prix, geste commercial, offre, election d'une proposition, ouverture d'une perte = la
// DIRECTION (direction table, referent, super-admin). Gestionnaires et assistants creent un
// contact, voient le pipeline, completent la fiche. Comptables : lecture. Autres : leurs
// contacts seulement.

/** Le profil complet d'un collaborateur, tel que la session le porte. */
export interface Profil {
  email?: string | null;
  /** public."User".role brut. */
  roleTable?: string | null;
  /** Habilitations intranet, ex. "referent_syndic:HLS". */
  habilitations?: readonly string[];
}

const ROLES_DIRECTION_TABLE = new Set(["ADMIN", "DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE"]);
const ROLES_SYNDIC_TABLE = new Set(["GESTIONNAIRE", "ASSISTANT"]);
const ROLES_HORS_SYNDIC_TABLE = new Set(["AUTRE", "GESTIONNAIRE_LOCATIVE"]);

function roleTableNormalise(roleTable: string | null | undefined): string {
  return (roleTable ?? "").trim().toUpperCase();
}

/** Direction d'apres la table : ADMIN, DIRECTEUR_SYNDIC, DIRECTEUR_AGENCE. */
export function estDirectionTable(roleTable: string | null | undefined): boolean {
  return ROLES_DIRECTION_TABLE.has(roleTableNormalise(roleTable));
}

/** Referent syndic d'une agence (habilitation intranet), de n'importe quelle agence si `agence` est absent. */
export function estReferentSyndic(profil: Profil, agence?: string): boolean {
  return (profil.habilitations ?? []).some((h) => {
    const [type, ag] = h.split(":");
    return type === "referent_syndic" && (!agence || (ag ?? "").toUpperCase() === agence.toUpperCase());
  });
}

/**
 * La DIRECTION au sens des decisions : direction table, directeur d'env (secours),
 * super-admin - et le referent syndic d'une agence, MAIS SEULEMENT pour cette agence
 * (Sekou, 16/09/2026 : « référent HLS seulement »). Sans agence connue (annuaire des
 * collaborateurs, ecritures dans public."User"), le referent n'est pas direction.
 */
export function estDirection(profil: Profil, agence?: string): boolean {
  if (estSuperAdmin(profil.email) || estDirecteur(profil.email) || estDirectionTable(profil.roleTable)) return true;
  return agence !== undefined && estReferentSyndic(profil, agence);
}

/** Direction quelque part : direction pleine, ou referent d'au moins une agence (pour ouvrir un ecran, pas pour agir). */
export function estDirectionQuelquePart(profil: Profil): boolean {
  return estDirection(profil) || estReferentSyndic(profil);
}

/** Travaille au syndic : gestionnaire ou assistant de copropriete, ou la direction. */
export function estEquipeSyndic(profil: Profil): boolean {
  return ROLES_SYNDIC_TABLE.has(roleTableNormalise(profil.roleTable)) || estDirection(profil);
}

/** Hors syndic : vente, location, accueil (AUTRE, GESTIONNAIRE_LOCATIVE). */
export function estHorsSyndic(profil: Profil): boolean {
  return ROLES_HORS_SYNDIC_TABLE.has(roleTableNormalise(profil.roleTable)) && !estDirection(profil);
}

// --- INTENTIONS METIER : propositions de contrat (ADR-039) ---

/** Tout collaborateur connecte peut noter un contact : c'est le but de la saisie rapide. */
export function peutSaisirContact(profil: Profil): boolean {
  return profil !== null;
}

/** Voir tout le pipeline, ou seulement ses propres contacts (hors syndic). */
export function peutVoirToutesLesPropositions(profil: Profil): boolean {
  return !estHorsSyndic(profil);
}

/** Completer la fiche de visite, le contact, le suivi : l'equipe syndic (pas la compta, pas hors syndic). */
export function peutCompleterProposition(profil: Profil): boolean {
  return estEquipeSyndic(profil);
}

/** Fixer le prix et le geste commercial, preparer et remettre l'offre : la direction (de l'agence de la proposition). */
export function peutFaireOffre(profil: Profil, agence?: string): boolean {
  return estDirection(profil, agence);
}

/** Passer une proposition « elue » et creer la copropriete (App A, contrat, Pennylane, reprise) : la direction (de l'agence). */
export function peutElire(profil: Profil, agence?: string): boolean {
  return estDirection(profil, agence);
}

/** Ouvrir un dossier de perte (la copro passe inactive) : la direction (de l'agence de la copro). */
export function peutOuvrirPerte(profil: Profil, agence?: string): boolean {
  return estDirection(profil, agence);
}

/** Clore une proposition (elue, refusee) ou dater sa remise : les memes que l'offre. */
export function peutDeciderProposition(profil: Profil, agence?: string): boolean {
  return estDirection(profil, agence);
}

/** Editer / imprimer un contrat de renouvellement, faire le recap AG : l'equipe syndic et la compta. */
export function peutEditerContrat(profil: Profil): boolean {
  return estEquipeSyndic(profil) || estComptable(profil.email, profil.roleTable);
}

/**
 * Operer au comptoir des cles (reserver, sortir, enregistrer le retour, creer un trousseau) :
 * un collaborateur de l'AGENCE du trousseau, ou la direction de cette agence (ADR-040).
 * Sans agence connue en session, on lit tout mais on n'ecrit rien.
 */
export function peutOperererCles(profil: Profil, agenceSession: string | undefined, agenceTrousseau: string): boolean {
  if (estDirection(profil, agenceTrousseau)) return true;
  return agenceSession !== undefined && agenceSession.toUpperCase() === agenceTrousseau.toUpperCase();
}

/** Corriger un mouvement, bloquer une entreprise, retirer un trousseau, forcer une sortie : la direction (de l'agence). */
export function peutAdministrerCles(profil: Profil, agence?: string): boolean {
  return estDirection(profil, agence);
}

/** Administrer le bareme : super-admin seulement. */
export function peutEditerBareme(profil: Profil): boolean {
  return estSuperAdmin(profil.email);
}

/** Message unique (UI + refus serveur) pour une action reservee a la direction. */
export const MESSAGE_RESERVE_DIRECTION = "Réservé à la direction (directeur de copropriété, référent d'agence).";

/** Le profil de droits d'un gestionnaire de session (email, role table, habilitations). */
export function profilDe(g: { email?: string | null; role?: string | null; habilitations?: readonly string[] }): Profil {
  return { email: g.email ?? null, roleTable: g.role ?? null, habilitations: g.habilitations ?? [] };
}
