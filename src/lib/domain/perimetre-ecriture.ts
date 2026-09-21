// LE PERIMETRE D'ECRITURE : qui a le droit d'ecrire sur quelle copro. UNE regle, resolue a
// un seul endroit (services/coproprietes/copro-appartient), que les 54 gardes d'ecriture
// appellent sans le savoir. ADR-041 (21/09/2026).
//
// Le droit d'ecrire est l'UNION de trois sources :
//   1. le PORTEFEUILLE : la copro est a moi, ou j'en suis l'assistant ;
//   2. le ROLE : directeur d'agence, directeur syndic et referent syndic ecrivent sur toute
//      leur agence ; ADMIN sur le cabinet (super-admin : idem, resolu par l'appelant) ;
//   3. une DELEGATION : « Delphine -> Dimitri, du 1er octobre au 31 mars, conge maternite »,
//      posee par la direction de l'agence ou par le titulaire, sur son portefeuille, une
//      agence ou une copro ; elle expire toute seule.
//
// La LECTURE reste ouverte au cabinet (services/coproprietes/perimetre-lecture) ; le
// perimetre COMPTABLE (domain/perimetre-comptable) reste a part pour l'instant (Sekou).
//
// Pur : pas de base, pas d'horloge, tout est fourni.

export type NiveauEcriture = "portefeuille" | "agence" | "cabinet";

/**
 * La VUE choisie a l'ecran (accueil, listes) : un filtre d'affichage borne par le perimetre
 * d'ecriture, jamais plus large. « perimetre » = tout ce que je peux toucher au-dela de mon
 * portefeuille (mon agence si mon role me la donne, mes delegations).
 */
export type VuePerimetre = "portefeuille" | "perimetre" | "cabinet";

/** Les vues qu'un collaborateur peut choisir, dans l'ordre d'affichage. */
export function vuesPermises(a: AuteurEcriture, aDesDelegations: boolean): VuePerimetre[] {
  const niveau = niveauEcriture(a);
  // Cabinet : « mon perimetre » serait le cabinet, une seule entree suffit.
  if (niveau === "cabinet") return ["portefeuille", "cabinet"];
  return niveau === "agence" || aDesDelegations ? ["portefeuille", "perimetre"] : ["portefeuille"];
}

/** Ramene une vue demandee a une vue permise (la plus proche, sinon le portefeuille). */
export function vueEffective(demandee: string | null | undefined, permises: readonly VuePerimetre[]): VuePerimetre {
  if (demandee && (permises as readonly string[]).includes(demandee)) return demandee as VuePerimetre;
  return "portefeuille";
}

/** Le libelle de la vue « perimetre », selon ce qui l'ouvre. */
export function libelleVuePerimetre(a: AuteurEcriture): string {
  return niveauEcriture(a) === "portefeuille" ? "Mes délégations" : "Mon agence";
}

/** Ce que le domaine a besoin de savoir d'un collaborateur pour decider. */
export interface AuteurEcriture {
  id: string;
  /** public."User".role brut (GESTIONNAIRE, DIRECTEUR_AGENCE, ADMIN…). */
  roleTable?: string | null;
  /** Code de son agence (LGC, ML, HLS, ASN), si rattache. */
  agenceCode?: string | null;
  /** Habilitations intranet (« referent_syndic:HLS », « propositions »). */
  habilitations?: readonly string[];
  /** Super-admin (allowlist d'env) : resolu par la couche auth, jamais ici. */
  superAdmin?: boolean;
}

/** Ce que le domaine a besoin de savoir d'une copro pour decider. */
export interface CoproEcriture {
  code: string;
  managerId?: string | null;
  assistantId?: string | null;
  agenceCode?: string | null;
}

export type PorteeDelegation = "portefeuille" | "agence" | "copro";

/** Une delegation active : `de` confie a `a` son portefeuille, une agence ou une copro. */
export interface Delegation {
  id: string;
  /** Le titulaire qui delegue. */
  deUserId: string;
  /** Le beneficiaire. */
  aUserId: string;
  portee: PorteeDelegation;
  /** Code d'agence, si portee = agence. */
  agenceCode?: string | null;
  /** Code de copro, si portee = copro. */
  coproCode?: string | null;
  depuisISO: string;
  /** Absente = sans fin. */
  jusquaISO?: string | null;
  motif?: string | null;
}

const ROLES_CABINET = new Set(["ADMIN"]);
const ROLES_AGENCE = new Set(["DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE"]);

function role(a: AuteurEcriture): string {
  return (a.roleTable ?? "").trim().toUpperCase();
}

/** Le niveau le plus large que le role donne : cabinet, agence, ou le seul portefeuille. */
export function niveauEcriture(a: AuteurEcriture): NiveauEcriture {
  if (a.superAdmin || ROLES_CABINET.has(role(a))) return "cabinet";
  if (ROLES_AGENCE.has(role(a)) || agencesReferent(a).length > 0) return "agence";
  return "portefeuille";
}

/** Les agences dont il est referent syndic (habilitation « referent_syndic:HLS »). */
function agencesReferent(a: AuteurEcriture): string[] {
  return (a.habilitations ?? [])
    .map((h) => h.split(":"))
    .filter(([type, agence]) => type === "referent_syndic" && agence)
    .map(([, agence]) => agence!.toUpperCase());
}

/** Les agences sur lesquelles le role lui donne l'ecriture (vide pour un gestionnaire). */
export function agencesEcriture(a: AuteurEcriture): string[] {
  const agences = new Set(agencesReferent(a));
  if (ROLES_AGENCE.has(role(a)) && a.agenceCode) agences.add(a.agenceCode.toUpperCase());
  return [...agences];
}

/** Une delegation est active a cette date. */
export function delegationActive(d: Delegation, aujourdHuiISO: string): boolean {
  return d.depuisISO <= aujourdHuiISO && (!d.jusquaISO || d.jusquaISO >= aujourdHuiISO);
}

/** La copro est dans le portefeuille de cette personne (titulaire ou assistant). */
function dansPortefeuilleDe(copro: CoproEcriture, userId: string): boolean {
  return copro.managerId === userId || copro.assistantId === userId;
}

/**
 * Par quelle voie ce collaborateur peut ecrire sur cette copro, ou null. `delegations` :
 * celles dont il est le beneficiaire (le service les a deja lues) ; les inactives sont
 * ignorees ici, l'appelant n'a pas a les filtrer.
 */
export function voieEcriture(
  auteur: AuteurEcriture,
  copro: CoproEcriture,
  delegations: readonly Delegation[],
  aujourdHuiISO: string,
): "portefeuille" | "role" | "delegation" | null {
  if (dansPortefeuilleDe(copro, auteur.id)) return "portefeuille";
  const niveau = niveauEcriture(auteur);
  if (niveau === "cabinet") return "role";
  if (niveau === "agence" && copro.agenceCode && agencesEcriture(auteur).includes(copro.agenceCode.toUpperCase())) return "role";
  for (const d of delegations) {
    if (d.aUserId !== auteur.id || !delegationActive(d, aujourdHuiISO)) continue;
    if (d.portee === "portefeuille" && dansPortefeuilleDe(copro, d.deUserId)) return "delegation";
    if (d.portee === "agence" && d.agenceCode && copro.agenceCode && d.agenceCode.toUpperCase() === copro.agenceCode.toUpperCase()) return "delegation";
    if (d.portee === "copro" && d.coproCode && d.coproCode.toUpperCase() === copro.code.toUpperCase()) return "delegation";
  }
  return null;
}

export function peutEcrire(auteur: AuteurEcriture, copro: CoproEcriture, delegations: readonly Delegation[], aujourdHuiISO: string): boolean {
  return voieEcriture(auteur, copro, delegations, aujourdHuiISO) !== null;
}

/**
 * Qui peut POSER une delegation au nom de `titulaire` : le titulaire lui-meme (avant de
 * partir), la direction de son agence, le cabinet. Une delegation d'agence ne se pose que
 * par quelqu'un qui ecrit deja sur cette agence.
 */
export function peutDeleguer(auteur: AuteurEcriture, titulaire: { id: string; agenceCode?: string | null }, portee: PorteeDelegation, agenceCode?: string | null): boolean {
  const niveau = niveauEcriture(auteur);
  if (niveau === "cabinet") return true;
  if (portee === "agence") return Boolean(agenceCode) && agencesEcriture(auteur).includes((agenceCode ?? "").toUpperCase());
  if (auteur.id === titulaire.id) return true;
  return niveau === "agence" && Boolean(titulaire.agenceCode) && agencesEcriture(auteur).includes((titulaire.agenceCode ?? "").toUpperCase());
}
