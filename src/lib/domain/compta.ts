// Domaine du "pole compta" : l'aller-retour gestionnaire <-> comptable autour de la
// preparation des comptes d'une AG. But : que les notes de la comptable et les reponses
// du gestionnaire vivent dans l'intranet (et ne se perdent plus apres le CS). Types purs.

/** Qui a ecrit la note. (Sans vraie auth : determine par le contexte - vue compta vs fiche.) */
export type AuteurNote = "comptable" | "gestionnaire";

/** Une note dans le fil comptes (question de la comptable, ou reponse du gestionnaire). */
export interface NoteCompta {
  id: string;
  auteur: AuteurNote;
  texte: string;
  /** Traitee (point regle) : ne reste plus "a faire". */
  resolu: boolean;
  /** ISO "YYYY-MM-DDTHH:mm:ssZ". */
  createdAt: string;
  /** Initiales / nom de qui a ecrit ou marque. */
  marquePar?: string;
}

/**
 * Statut d'un poste de la checklist de verification comptable.
 *   - a_verifier    : etat par defaut (rien fait) -> jamais stocke (= absence en base).
 *   - ok            : poste verifie, conforme.
 *   - a_revoir      : poste examine mais qui pose probleme (a corriger).
 *   - non_applicable: poste sans objet pour cette copro (ex. pas de travaux votes).
 */
export type StatutPoste = "a_verifier" | "ok" | "a_revoir" | "non_applicable";

/** Map slug de poste -> statut. Un slug absent = poste "a_verifier" (defaut implicite). */
export type ChecksCompta = Record<string, StatutPoste>;

/** Etat compta d'une AG : les 2 flags + la checklist de postes + le fil de notes. */
export interface EtatCompta {
  /** La comptable a fini de verifier les comptes (visible au gestionnaire). Feu vert final. */
  comptesVerifies: boolean;
  /** Le CS demande les comptes AVANT la reunion (gestionnaire -> comptable). */
  envoyerAvant: boolean;
  /** Statut de chaque poste de la checklist (slug -> statut). Absent = "a_verifier". */
  checks: ChecksCompta;
  /** Fil de notes, du plus ancien au plus recent. */
  notes: NoteCompta[];
}

/** Une AG a preparer, vue cote comptable (file de travail). */
export interface AgAPreparer {
  coproCode: string;
  coproNom: string;
  /** Date d'AG (ISO "YYYY-MM-DD"). */
  agDate: string;
  comptesVerifies: boolean;
  envoyerAvant: boolean;
  /** Nb de notes non resolues (en attente de traitement). */
  notesOuvertes: number;
}

/** Les 2 flags compta, identifiants stables (stockes dans intranet_odj_champs). */
export const FLAG_COMPTES_VERIFIES = "compta.comptes_verifies";
export const FLAG_ENVOYER_AVANT = "compta.envoyer_avant";

// --- CHECKLIST de verification des comptes (postes) ------------------------
// La liste des postes vit en CODE (constante ci-dessous, comme le squelette de l'ODJ) ;
// seul l'ETAT (le statut par poste) est stocke, cle par (copropriete_id, ag_date, champ_id)
// dans la table generique intranet_odj_champs. AUCUNE table dediee. champ_id =
// "compta.check.<slug>", valeur = le statut. Sekou ajustera libelles/ordre/liste ici.

/** Un poste de la checklist : un point de controle a verifier avant l'AG. */
export interface PosteCompta {
  slug: string;
  libelle: string;
}

/** Les postes de verification, dans l'ordre d'affichage (editable par Sekou). */
export const POSTES_COMPTA: readonly PosteCompta[] = [
  { slug: "rappro-bancaire", libelle: "Rapprochement bancaire (solde banque = compta)" },
  { slug: "comptes-coproprietaires", libelle: "Comptes copropriétaires (soldes, impayés, relances à jour)" },
  { slug: "comptes-fournisseurs", libelle: "Comptes fournisseurs (factures rattachées, charges à payer)" },
  { slug: "repartition-charges", libelle: "Répartition des charges (clés / tantièmes corrects)" },
  { slug: "regularisation-charges", libelle: "Régularisation des charges de l'exercice" },
  { slug: "fonds-travaux-alur", libelle: "Fonds de travaux ALUR (cotisation + solde)" },
  { slug: "travaux-votes", libelle: "Travaux votés art. 14-2 (suivi budget / dépenses)" },
  { slug: "report-resultat", libelle: "Report à nouveau & résultat de l'exercice" },
  { slug: "annexes-comptables", libelle: "Annexes comptables cohérentes (5 annexes réglementaires)" },
] as const;

/** Prefixe des champ_id de la checklist dans intranet_odj_champs. */
const PREFIXE_CHECK = "compta.check.";

/** Slugs valides (issus de POSTES_COMPTA). Empeche d'ecrire un poste inconnu. */
const SLUGS_POSTE: ReadonlySet<string> = new Set(POSTES_COMPTA.map((p) => p.slug));

/** Le slug correspond-il a un poste connu ? */
export function estSlugPoste(slug: string): boolean {
  return SLUGS_POSTE.has(slug);
}

/** slug de poste -> champ_id stocke (ex. "rappro-bancaire" -> "compta.check.rappro-bancaire"). */
export function champIdPoste(slug: string): string {
  return `${PREFIXE_CHECK}${slug}`;
}

/** champ_id stocke -> slug de poste, ou null si ce champ_id n'est pas un poste checklist. */
export function posteDepuisChampId(champId: string): string | null {
  if (!champId.startsWith(PREFIXE_CHECK)) return null;
  const slug = champId.slice(PREFIXE_CHECK.length);
  return estSlugPoste(slug) ? slug : null;
}

const STATUTS_POSTE: readonly StatutPoste[] = ["a_verifier", "ok", "a_revoir", "non_applicable"];

/** La valeur brute lue en base est-elle un statut de poste connu ? */
export function estStatutPoste(v: string | null | undefined): v is StatutPoste {
  return typeof v === "string" && (STATUTS_POSTE as readonly string[]).includes(v);
}

/** Statut d'un poste (defaut "a_verifier" si absent de la map). */
export function statutPoste(checks: ChecksCompta, slug: string): StatutPoste {
  return checks[slug] ?? "a_verifier";
}

/** Progression de la checklist : ventilation par statut + total. */
export interface ProgressionChecklist {
  /** Nb total de postes (POSTES_COMPTA.length). */
  total: number;
  /** Postes marques "ok". */
  ok: number;
  /** Postes marques "a_revoir". */
  aRevoir: number;
  /** Postes marques "non_applicable". */
  nonApplicable: number;
  /** Postes restes "a_verifier". */
  aVerifier: number;
  /** Postes TRAITES (plus rien a faire) = ok + non_applicable. */
  traites: number;
}

/** Compte les postes par statut sur l'ensemble POSTES_COMPTA (les absents = "a_verifier"). */
export function progressionChecklist(checks: ChecksCompta): ProgressionChecklist {
  let ok = 0;
  let aRevoir = 0;
  let nonApplicable = 0;
  for (const p of POSTES_COMPTA) {
    const s = statutPoste(checks, p.slug);
    if (s === "ok") ok += 1;
    else if (s === "a_revoir") aRevoir += 1;
    else if (s === "non_applicable") nonApplicable += 1;
  }
  const total = POSTES_COMPTA.length;
  return {
    total,
    ok,
    aRevoir,
    nonApplicable,
    aVerifier: total - ok - aRevoir - nonApplicable,
    traites: ok + nonApplicable,
  };
}

/** Statut global de la checklist (pour un pastillage d'ensemble). */
export type StatutGlobalChecklist = "vierge" | "en_cours" | "a_revoir" | "complet";

/**
 * Etat d'ensemble de la checklist :
 *   - "a_revoir" : au moins un poste a corriger (prioritaire sur le reste).
 *   - "complet"  : tous les postes traites (ok / non_applicable), aucun a revoir.
 *   - "vierge"   : rien touche (tout "a_verifier").
 *   - "en_cours" : entre les deux.
 */
export function statutGlobalChecklist(checks: ChecksCompta): StatutGlobalChecklist {
  const p = progressionChecklist(checks);
  if (p.aRevoir > 0) return "a_revoir";
  if (p.traites === p.total) return "complet";
  if (p.traites === 0) return "vierge";
  return "en_cours";
}
