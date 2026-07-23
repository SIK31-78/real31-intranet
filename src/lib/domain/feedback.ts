// =============================================================================
// DOMAINE des REMONTEES COLLABORATEURS (bug / idee) : une seule matiere derriere
// le bouton "Signaler", la roadmap admin et la vitrine /nouveautes.
// Module PUR : zero I/O, zero dependance technique -> testable offline.
// =============================================================================
//
// CONFIDENTIALITE (ligne rouge) : la page publique /nouveautes ne doit JAMAIS
// exposer l'auteur, la description interne ni la note. La projection publique
// `versEntreePublique` est le SEUL passage autorise vers le public : elle ne garde
// que {type, titre, statut, livreAt}. Tout le reste (auteurEmail, description,
// noteInterne, raisonEcart) est strictement interne.
//
// CYCLE DE VIE d'une remontee :
//   nouveau --> prevu | en_cours | ecarte
//   prevu   --> en_cours | ecarte
//   en_cours--> livre | ecarte
//   livre / ecarte : etats terminaux.
// Regle : passer a `ecarte` EXIGE une raison (raisonEcart non vide).

/** Nature d'une remontee. */
export const TYPES_FEEDBACK = ["bug", "idee"] as const;
export type TypeFeedback = (typeof TYPES_FEEDBACK)[number];

/** Gravite ressentie par le collaborateur (porte le tri de triage). */
export const SEVERITES_FEEDBACK = ["bloquant", "genant", "confort"] as const;
export type SeveriteFeedback = (typeof SEVERITES_FEEDBACK)[number];

/** Etat dans le cycle de vie (pilote par l'admin). */
export const STATUTS_FEEDBACK = ["nouveau", "prevu", "en_cours", "livre", "ecarte"] as const;
export type StatutFeedback = (typeof STATUTS_FEEDBACK)[number];

/** Statuts VISIBLES du public (la vitrine /nouveautes). Ni `nouveau`, ni `ecarte`. */
export const STATUTS_PUBLICS = ["prevu", "en_cours", "livre"] as const;
export type StatutPublic = (typeof STATUTS_PUBLICS)[number];

/** Une remontee complete, telle que l'admin la voit (JAMAIS servie au public tel quel). */
export interface Feedback {
  id: string;
  type: TypeFeedback;
  /** Court, editable par l'admin (derive de la description a la creation). */
  titre: string;
  /** Le texte du collaborateur. INTERNE : jamais expose sur /nouveautes. */
  description: string;
  /** Pathname capture au moment du signalement (ex "/copropriete/S104"). */
  page?: string;
  /** INTERNE : jamais expose sur /nouveautes. */
  auteurEmail?: string;
  auteurInitiales?: string;
  severite: SeveriteFeedback;
  statut: StatutFeedback;
  /** Ordre dans la roadmap "a venir" (plus petit = plus haut). Absent = non priorise. */
  priorite?: number;
  /** Note de travail admin. INTERNE : jamais exposee au public. */
  noteInterne?: string;
  /** Renseignee quand statut = `ecarte` (regle : ecarter exige une raison). */
  raisonEcart?: string;
  /** ISO. */
  createdAt: string;
  /** ISO ; touche a chaque changement de statut / edition admin. */
  updatedAt?: string;
  /** ISO ; pose quand statut -> `livre`. Sert de date du changelog. */
  livreAt?: string;
}

/** Ce que le public voit d'une remontee. AUCUN champ interne (ni auteur, ni description, ni note). */
export interface EntreePublique {
  type: TypeFeedback;
  titre: string;
  statut: StatutFeedback;
  /** ISO ; present pour les entrees livrees (date du changelog). */
  livreAt?: string;
}

// --- TRANSITIONS DE STATUT -----------------------------------------------------

/** Les cibles autorisees depuis chaque statut (livre / ecarte = terminaux). */
const TRANSITIONS: Record<StatutFeedback, readonly StatutFeedback[]> = {
  nouveau: ["prevu", "en_cours", "ecarte"],
  prevu: ["en_cours", "ecarte"],
  en_cours: ["livre", "ecarte"],
  livre: [],
  ecarte: [],
};

/** Refus normalises d'un changement de statut. */
export type RefusTransition = "transition_interdite" | "raison_ecart_requise";

export type VerdictTransition = { ok: true } | { ok: false; refus: RefusTransition };

/**
 * LE verdict d'un changement de statut :
 *   1. la transition `de -> vers` est-elle permise par le cycle de vie ?
 *   2. passer a `ecarte` EXIGE une raison non vide.
 */
export function verifierTransition(
  de: StatutFeedback,
  vers: StatutFeedback,
  opts?: { raisonEcart?: string },
): VerdictTransition {
  if (!TRANSITIONS[de].includes(vers)) return { ok: false, refus: "transition_interdite" };
  if (vers === "ecarte" && !opts?.raisonEcart?.trim()) {
    return { ok: false, refus: "raison_ecart_requise" };
  }
  return { ok: true };
}

/** Cibles proposables depuis un statut (pour l'UI admin). */
export function transitionsPossibles(de: StatutFeedback): readonly StatutFeedback[] {
  return TRANSITIONS[de];
}

// --- TRI DE TRIAGE -------------------------------------------------------------

/** Rang de gravite : bloquant avant genant avant confort. */
const RANG_SEVERITE: Record<SeveriteFeedback, number> = { bloquant: 0, genant: 1, confort: 2 };

/**
 * Comparateur de triage admin : le plus grave d'abord, puis le plus recent d'abord.
 * (a utiliser avec Array.prototype.sort sur une COPIE.)
 */
export function trierTriage(a: Feedback, b: Feedback): number {
  const parGravite = RANG_SEVERITE[a.severite] - RANG_SEVERITE[b.severite];
  if (parGravite !== 0) return parGravite;
  return b.createdAt.localeCompare(a.createdAt);
}

// --- PROJECTION PUBLIQUE (le seul passage autorise vers /nouveautes) -----------

/**
 * Reduit une remontee a ce que le public peut voir : {type, titre, statut, livreAt}.
 * TOUT le reste (auteur, description, note, raison d'ecart, priorite) est ecarte -
 * c'est le garde-fou PII de la vitrine.
 */
export function versEntreePublique(f: Feedback): EntreePublique {
  return {
    type: f.type,
    titre: f.titre,
    statut: f.statut,
    ...(f.livreAt ? { livreAt: f.livreAt } : {}),
  };
}

/** Ce statut est-il VISIBLE du public (prevu / en_cours / livre) ? */
export function estStatutPublic(statut: StatutFeedback): statut is StatutPublic {
  return (STATUTS_PUBLICS as readonly string[]).includes(statut);
}

// --- HELPERS DE SAISIE ---------------------------------------------------------

/** Longueur max d'un titre derive automatiquement. */
export const TITRE_MAX = 80;

/**
 * Titre par defaut derive de la description (le bouton ne capture pas de titre :
 * l'admin l'affinera). Premiere ligne condensee, coupee proprement a TITRE_MAX.
 */
export function titreParDefaut(description: string): string {
  const nettoye = description.trim().replace(/\s+/g, " ");
  if (nettoye.length <= TITRE_MAX) return nettoye;
  return `${nettoye.slice(0, TITRE_MAX - 1).trimEnd()}…`;
}

// --- VALEURS BRUTES (input / base) ---------------------------------------------

export function estTypeFeedback(v: string): v is TypeFeedback {
  return (TYPES_FEEDBACK as readonly string[]).includes(v);
}
export function estSeveriteFeedback(v: string): v is SeveriteFeedback {
  return (SEVERITES_FEEDBACK as readonly string[]).includes(v);
}
export function estStatutFeedback(v: string): v is StatutFeedback {
  return (STATUTS_FEEDBACK as readonly string[]).includes(v);
}

/**
 * Table `intranet_feedback` pas encore creee (SQL non passe) : leve par l'adapter
 * Supabase. La vitrine /nouveautes retombe sur un etat vide, le panneau admin affiche
 * un bandeau "SQL a passer", le bouton de signalement rend un message propre.
 */
export class FeedbackNonConfigureError extends Error {
  constructor() {
    super("Feedback non configuré : la table intranet_feedback n'existe pas encore.");
    this.name = "FeedbackNonConfigureError";
  }
}
