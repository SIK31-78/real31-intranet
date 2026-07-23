// =============================================================================
// DOMAINE des CLES API MACHINE (auth de /api/v1 + serveur MCP "real31").
// Module PUR : zero I/O, zero dependance technique -> testable offline.
// =============================================================================
//
// >>> LIGNE ROUGE (gravee DECISIONS.md, non negociable) <<<
// L'API et le MCP ne permettront JAMAIS, quels que soient les scopes :
//   - une ecriture eStale reelle ;
//   - un envoi de mail ;
//   - une suppression ;
//   - conclureAg / l'injection reprise.
// Ces gestes restent derriere le GO/STOP humain dans l'UI de l'intranet. Le modele
// de scopes ci-dessous ne DECRIT donc que ce que l'API sait faire : de la lecture
// large + deux ecritures internes sures (supervision, note compta).
//
// LE MODELE :
//   - "lecture" : scope GLOBAL de lecture (toute la surface /api/v1 en GET).
//   - "ecriture:supervision" : cocher un item de supervision AG.
//   - "ecriture:compta"      : poser une note dans le fil compta d'une AG.
// Un scope d'ecriture N'IMPLIQUE PAS la lecture (et inversement) : chaque cle liste
// explicitement ce qu'elle porte.
//
// CLOISONNEMENT MACHINE :
//   - cle liee a un gestionnaire (managerId) : la machine "est" ce gestionnaire,
//     lectures cloisonnees a son portefeuille, ecritures possibles (perimetre
//     re-verifie par les services existants, anti-IDOR).
//   - cle CABINET (managerId absent) : lecture TRANSVERSE seulement.
//     TOUTE ecriture exige un managerId (regle `verifierAcces`).

/** Les scopes connus de l'API v1. */
export const SCOPES_API = ["lecture", "ecriture:supervision", "ecriture:compta"] as const;
export type ScopeApi = (typeof SCOPES_API)[number];

/** La valeur brute (base / input) est-elle un scope connu ? */
export function estScopeApi(v: string): v is ScopeApi {
  return (SCOPES_API as readonly string[]).includes(v);
}

/** Ce scope designe-t-il une ecriture ? */
export function estScopeEcriture(scope: ScopeApi): boolean {
  return scope.startsWith("ecriture:");
}

/** Une cle API, SANS son secret (le hash ne sort jamais du port vers l'UI). */
export interface CleApi {
  id: string;
  nom: string;
  /** 8 premiers caracteres de la cle en clair ("real31_x"), pour l'affichage admin. */
  prefixe: string;
  scopes: string[];
  /** Gestionnaire lie (public."User".id). Absent = cle cabinet, lecture transverse. */
  managerId?: string;
  /** Email / initiales du super-admin createur. */
  creePar?: string;
  /** ISO. */
  createdAt: string;
  /** ISO ; absent = pas d'expiration. */
  expiresAt?: string;
  /** ISO ; present = revoquee (la ligne reste pour l'audit). */
  revokedAt?: string;
  /** ISO ; derniere requete authentifiee. */
  lastUsedAt?: string;
  /** Compteur simple de requetes du jour (visibilite, pas un rate limit). */
  usageJour: number;
  /** Jour du compteur, ISO "YYYY-MM-DD" ; un autre jour -> compteur reparti a 1. */
  usageJourDate?: string;
}

/** Le scope requis est-il porte par la cle ? (aucune implication entre scopes) */
export function scopeAutorise(scopes: string[], requis: ScopeApi): boolean {
  return scopes.includes(requis);
}

/** Refus normalises de l'auth API (mappes en 401/403 par la couche HTTP). */
export type RefusCle =
  | "cle_invalide" // inconnue / hash non concordant
  | "cle_revoquee"
  | "cle_expiree"
  | "scope_manquant"
  | "ecriture_exige_gestionnaire";

export type VerdictAcces = { ok: true } | { ok: false; refus: RefusCle };

/** La cle est-elle encore VALIDE (ni revoquee, ni expiree) a l'instant `nowISO` ? */
export function verifierValidite(
  cle: Pick<CleApi, "revokedAt" | "expiresAt">,
  nowISO: string,
): VerdictAcces {
  if (cle.revokedAt) return { ok: false, refus: "cle_revoquee" };
  if (cle.expiresAt && cle.expiresAt <= nowISO) return { ok: false, refus: "cle_expiree" };
  return { ok: true };
}

/**
 * LE verdict d'acces complet d'une cle pour un scope requis :
 *   1. validite (revocation / expiration) ;
 *   2. scope porte ;
 *   3. TOUTE ecriture exige une cle liee a un gestionnaire (managerId).
 */
export function verifierAcces(
  cle: Pick<CleApi, "revokedAt" | "expiresAt" | "scopes" | "managerId">,
  scopeRequis: ScopeApi,
  nowISO: string,
): VerdictAcces {
  const validite = verifierValidite(cle, nowISO);
  if (!validite.ok) return validite;
  if (!scopeAutorise(cle.scopes, scopeRequis)) return { ok: false, refus: "scope_manquant" };
  if (estScopeEcriture(scopeRequis) && !cle.managerId) {
    return { ok: false, refus: "ecriture_exige_gestionnaire" };
  }
  return { ok: true };
}

/** Compteur journalier apres une requete a `dateJourISO` ("YYYY-MM-DD"). */
export function usageApresRequete(
  cle: Pick<CleApi, "usageJour" | "usageJourDate">,
  dateJourISO: string,
): { usageJour: number; usageJourDate: string } {
  const memeJour = cle.usageJourDate === dateJourISO;
  return { usageJour: memeJour ? cle.usageJour + 1 : 1, usageJourDate: dateJourISO };
}

/** Longueur du prefixe affiche (8 premiers caracteres, ex "real31_x"). */
export const PREFIXE_LONGUEUR = 8;

/**
 * Table `intranet_api_keys` pas encore creee (SQL non passe) : l'API repond 503
 * `api_non_configuree` proprement, jamais un crash. Levee par l'adapter Supabase,
 * mappee par la couche HTTP.
 */
export class ApiNonConfigureeError extends Error {
  constructor() {
    super("Cles API non configurees : la table intranet_api_keys n'existe pas encore.");
    this.name = "ApiNonConfigureeError";
  }
}
