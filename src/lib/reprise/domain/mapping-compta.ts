// Domaine PUR du MAPPING des comptes source (grand livre N-1 du syndic sortant) vers leurs
// cibles eStale (aucune I/O, aucun import technique, aucune ecriture). C'est le coeur du
// resolveur de l'increment 2 : traduire chaque compte source distinct en un PLAN, avec un
// GARDE-FOU central -> tout compte du bloc A (classes 4/5) non mappe ET sans action planifiee
// est une ERREUR bloquante (pretAImporter = false).
//
// Deux natures de decision :
//   1. DETERMINISTE par prefixe de nomenclature (401 fournisseur, 450 coproprietaire, 512 banque,
//      501 livret, 471->472, 408 tel quel, 489 a confirmer, classe 6 -> bloc B, classe 1/7 -> bloc C).
//   2. APPARIEMENT PAR NOM pour les tiers (401/450) : on compare l'intitule du compte source au
//      nom des comptes tiers deja presents dans eStale. C'est LA source d'erreur n.1 de la reprise
//      -> on est CONSERVATEUR : appariement fort ET non ambigu pour mapper automatiquement, sinon
//      WARNING a valider par un humain (jamais silencieux), sinon action de creation ou erreur.
//
// PII : ce module manipule des noms (intitules) UNIQUEMENT pour le calcul de score ; il ne les
// recopie JAMAIS dans les messages/notes du plan (seuls numeros de compte, scores et compteurs).

import { classeDe, type ClasseComptable } from "@/lib/reprise/domain/compta";
import {
  messageAvantRepartition,
  messageDegradationBascule,
  messageRaccordement,
  type VerdictAvantRepartition,
  type VerdictRaccordement,
} from "@/lib/reprise/domain/controle-comptes";

// --- Constantes de reglage (a arbitrer avec Sekou) --------------------------------

/** Cle de repartition par defaut d'une ecriture de reprise (charges generales cabinet). */
export const CLE_DEFAUT = "001";
/** Journal eStale de la reprise : les a-nouveaux / soldes de reprise vont en carryforward. */
export const JOURNAL_REPRISE = "carryforward" as const;

/** Score >= ce seuil ET non ambigu => appariement automatique (mappe). */
export const SEUIL_APPARIEMENT_FORT = 0.9;
/** Score < ce seuil => aucun candidat fiable (creation pour 401, erreur pour 450). */
export const SEUIL_APPARIEMENT_MINI = 0.5;
/** Ecart minimal entre le meilleur et le 2e candidat en dessous duquel on juge AMBIGU. */
export const MARGE_AMBIGUITE = 0.08;

// --- Types du plan ----------------------------------------------------------------

/** Cible eStale d'un compte source : nomenclature + cle + journal de reprise. */
export interface CibleMapping {
  /** Nomenclature eStale visee (exacte si tiers apparie / compte d'attente existant ; sinon
   *  racine canonique a resoudre finement contre le plan comptable eStale a l'import). */
  nomenclature: string;
  /** Cle de repartition (defaut CLE_DEFAUT). */
  cle: string;
  /** Journal de reprise (carryforward). */
  journal: typeof JOURNAL_REPRISE;
}

/** Action A FAIRE a l'increment 3 (jamais executee ici : le plan reste un DRY-RUN strict). */
export type ActionMapping =
  | { type: "creer_fournisseur"; intituleSource?: string }
  | { type: "creer_sous_compte"; parent: string; suffix: string; nom: string }
  // Coproprietaire a comptes multiples : creer un compte 450 SEPARE (pas de fusion silencieuse),
  // rattache a un owner eStale existant (ownerNomenclature). A l'import (Inc. 3), on append un
  // sous-compte sous le 450 owner en reprenant sa cle de repartition (dkID). Cf. rapport.
  | { type: "creer_compte_separe"; ownerNomenclature: string };

/** Statut de resolution d'un compte source. */
export type StatutMapping =
  | "mappe" // cible eStale resolue (deterministe ou appariement fort)
  | "action_requise" // non mappe MAIS action planifiee (creation fournisseur / sous-compte)
  | "warning_appariement" // candidat trouve mais faible/ambigu -> validation humaine
  | "reporte_bloc_b" // classe 6 : importe a l'increment 4 (RGD/TVA)
  | "reporte_bloc_c" // classe 1/7 (et 2/3) : eclatement a l'increment 5
  | "non_mappe"; // bloc A non resolu et sans action -> ERREUR bloquante

/** Categorie deduite du prefixe de nomenclature (regle metier appliquee). */
export type CategorieCompte =
  | "fournisseur" // 401
  | "fnp_408" // 408 factures non parvenues
  | "coproprietaire" // 450
  | "attente_ancien" // 471 (ancien syndic) -> 472
  | "attente_472" // 472
  | "regularisation_489" // 489
  | "banque" // 512 -> compte d'attente 471999
  | "livret" // 501 -> compte d'attente 471998
  | "autre_bloc_a" // autre classe 4/5
  | "charge_bloc_b" // classe 6
  | "hors_bloc_a"; // classe 1/2/3/7

/** Resolution d'UN compte source distinct. */
export interface EntreeMapping {
  /** Numero de compte tel que la source le nomme (ex. "4501.100489139"). */
  compteSource: string;
  /** Intitule imprime du compte source (PII : non recopie dans les messages du plan). */
  intitule?: string;
  /** Classe comptable (1er chiffre). */
  classe: ClasseComptable;
  /** Categorie / regle appliquee. */
  categorie: CategorieCompte;
  /** Statut de resolution. */
  statut: StatutMapping;
  /** Cible eStale (si mappe, warning avec candidat, ou report avec nomenclature triviale). */
  cible?: CibleMapping;
  /** Action planifiee (si action_requise). */
  action?: ActionMapping;
  /** Score d'appariement 0..1 (tiers 401/450 uniquement). */
  confiance?: number;
  /**
   * Index (dans PlanMapping.groupesHomonymes) du groupe de comptes 450 partageant le meme nom
   * normalise. Present uniquement pour un compte membre d'un tel groupe. PII-free (un entier).
   */
  groupeHomonyme?: number;
  /** Note explicative (jamais de nom : regle appliquee, motif du warning...). */
  note?: string;
}

/**
 * Groupe de comptes source 450 partageant le MEME nom normalise (coproprietaire a comptes
 * multiples). On ne stocke que les numeros de compte (PII-free) ; le nom affiche en UI est relu
 * depuis l'intitule des entrees. Dans un tel groupe, l'appariement automatique est DESACTIVE
 * (ambigu par construction) -> tout le groupe passe en revue humaine.
 */
export interface GroupeHomonymes {
  /** Comptes source (>= 2) du groupe, dans l'ordre d'apparition. */
  comptes: string[];
}

/** Le PLAN de mapping complet. */
export interface PlanMapping {
  /** Une entree par compte source distinct. */
  entrees: EntreeMapping[];
  /** Compteur par statut. */
  compteurs: Record<StatutMapping, number>;
  /** Erreurs bloquantes (bloc A non mappe sans action). PII-free. */
  erreurs: string[];
  /** Warnings a valider par un humain (appariements faibles/ambigus). PII-free. */
  warnings: string[];
  /** Notes informatives (regles reportees, 489...). PII-free. */
  notes: string[];
  /** Groupes de comptes 450 homonymes (a comptes multiples). Absent si aucun. PII-free. */
  groupesHomonymes?: GroupeHomonymes[];
  /**
   * Verdict "grand livre AVANT repartition" (comptes de classe 6/7 avec report non nul). Present
   * (et bloquant) uniquement quand la signature est detectee. Bloquant STRICT : tant qu'il est la,
   * pretAImporter reste false (pas d'override). PII-free. Attache par les services (qui ont acces
   * aux ControleCompte) via appliquerAvantRepartition ; rejoue par appliquerDecisions.
   */
  avantRepartition?: VerdictAvantRepartition;
  /**
   * Verdict du CONTROLE CROISE cloture <-> en cours (les a-nouveaux de l'exercice en cours doivent
   * egaler les soldes finaux de l'exercice cloture). Present (et bloquant) uniquement quand un
   * raccordement KO est detecte : tant qu'il est la, pretAImporter reste false (l'un des deux grands
   * livres est faux). PII-free. Attache par les services via appliquerRaccordement ; rejoue par
   * appliquerDecisions. Absent pour l'ecran mapping standalone (un seul grand livre a la fois).
   */
  raccordement?: VerdictRaccordement;
  /** true si aucune erreur ET aucun warning -> le plan peut etre execute a l'increment 3. */
  pretAImporter: boolean;
}

// --- Classification par prefixe ---------------------------------------------------

/** Racine chiffree d'un compte source : les chiffres AVANT le point ("4501.100..." -> "4501"). */
export function racineCompte(compteSource: string): string {
  const avantPoint = compteSource.split(".")[0] ?? compteSource;
  return avantPoint.replace(/[^0-9]/g, "");
}

/** Classe comptable tolerante (ne leve pas : renvoie null si hors 1..7). */
function classeSafe(compteSource: string): ClasseComptable | null {
  try {
    return classeDe(compteSource);
  } catch {
    return null;
  }
}

/** Applique les regles de prefixe pour classer un compte source. */
export function classifierCompte(compteSource: string): CategorieCompte {
  const r = racineCompte(compteSource);
  if (r.startsWith("401")) return "fournisseur";
  if (r.startsWith("408")) return "fnp_408";
  if (r.startsWith("450")) return "coproprietaire";
  if (r.startsWith("471")) return "attente_ancien";
  if (r.startsWith("472")) return "attente_472";
  if (r.startsWith("489")) return "regularisation_489";
  if (r.startsWith("512")) return "banque";
  if (r.startsWith("501")) return "livret";
  const classe = r ? Number(r[0]) : NaN;
  if (classe === 4 || classe === 5) return "autre_bloc_a";
  if (classe === 6) return "charge_bloc_b";
  return "hors_bloc_a"; // classes 1/2/3/7 (bloc C ou hors perimetre reprise A/B)
}

/** Transforme un compte d'attente ancien syndic 471... en sa cible 472... (meme suffixe). */
export function cible471vers472(compteSource: string): string {
  const r = racineCompte(compteSource);
  return "472" + r.slice(3);
}

// --- Appariement par nom (le coeur conservateur) ----------------------------------

/**
 * Mots ignores dans l'appariement (bruit) : civilites ET formes sociales. On ne retire QUE des
 * tokens NON DISTINCTIFS : leur suppression ne peut pas rapprocher deux parties differentes (les
 * tokens distinctifs restent). Ex. "EDF SA" ~ "EDF" -> match ; "SCI DUPONT" ~ "SCI MARTIN" -> 0.
 */
const MOTS_IGNORES = new Set([
  // civilites
  "m",
  "mr",
  "mme",
  "mlle",
  "melle",
  "monsieur",
  "madame",
  "mademoiselle",
  "mrs",
  "ms",
  // formes sociales (fournisseurs et SCI coproprietaires)
  "sa",
  "sas",
  "sasu",
  "sarl",
  "eurl",
  "sci",
  "scp",
  "snc",
  "sccv",
  "gie",
  "sc",
  "scm",
  // roles imprimes en prefixe d'intitule (Matera : "Coproprietaire - Alexandra X" sur les
  // 10 comptes 450 de S0303) : presents PARTOUT, ils diluent mecaniquement tous les scores
  // sans jamais distinguer deux personnes. Meme statut que les civilites.
  "coproprietaire",
  "coproprietaires",
  "et",
  "ou",
]);

/** Minuscule, sans accents, sans ponctuation, espaces normalises. */
export function normaliserNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Tokens significatifs d'un nom (sans civilites, sans doublons d'ordre). */
export function tokensNom(nom: string): string[] {
  return normaliserNom(nom)
    .split(" ")
    .filter((t) => t.length > 0 && !MOTS_IGNORES.has(t));
}

/**
 * Score d'un SOUS-ENSEMBLE STRICT (>= 2 tokens distinctifs entierement couverts par l'autre
 * cote). Au-dessus du seuil fort (0.9) mais SOUS l'egalite parfaite (1.0) : quand une egalite
 * exacte ET un sous-ensemble coexistent, l'egalite garde la tete - et l'ecart (0.05) reste
 * sous MARGE_AMBIGUITE, donc le cas part en revue humaine plutot qu'en choix silencieux.
 */
export const SCORE_SOUS_ENSEMBLE = 0.95;

/**
 * Score d'appariement 0..1, INDEPENDANT DE L'ORDRE (gere l'inversion nom<->prenom via ensembles).
 * score = |tokens communs| / max(|A|,|B|).
 *
 * SOUS-ENSEMBLE STRICT (decision Sekou 2026-08-18, mesure S0303) : quand TOUS les tokens d'un
 * cote (>= 2) sont couverts par l'autre, c'est une SIGNATURE FORTE, pas un appariement faible.
 * Cas reel : le compte source nomme UNE personne ("Alexandra BERTHO"), eStale porte l'entite
 * complete ("Bertho Taube Arthur & Alexandra") -> {alexandra, bertho} est un sous-ensemble
 * strict, deux personnes DIFFERENTES ne peuvent pas produire ca (leurs tokens distinctifs
 * divergeraient). Le traiter ainsi est PLUS sur que d'abaisser le seuil global : un plancher a
 * 0.75 lierait des paires reellement differentes, un sous-ensemble strict jamais.
 * GARDE : un seul token commun (nom de famille seul, "MARTIN" ~ "MARTIN PAUL") ne suffit PAS -
 * deux MARTIN distincts se ressemblent exactement comme ca ; il reste sous le seuil.
 *
 * Un token DIFFERENT (typo) baisse le score : on ne fait AUCUN rapprochement flou
 * (edit-distance) -> direction conservatrice, un doute part en warning/erreur plutot qu'en
 * faux positif.
 */
export function scoreAppariement(a: string, b: string): number {
  const ta = new Set(tokensNom(a));
  const tb = new Set(tokensNom(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const brut = inter / Math.max(ta.size, tb.size);
  const sousEnsemble = inter >= 2 && (inter === ta.size || inter === tb.size);
  return sousEnsemble ? Math.max(brut, SCORE_SOUS_ENSEMBLE) : brut;
}

/** Un compte tiers candidat cote eStale (nomenclature + intitule/nom). */
export interface CandidatCompte {
  nomenclature: string;
  intitule: string;
}

/** Resultat d'un appariement : meilleur candidat + score + drapeau d'ambiguite. */
export interface Appariement {
  cible?: string;
  confiance: number;
  ambigu: boolean;
}

/** Cherche le meilleur candidat par nom + detecte l'ambiguite (2e candidat trop proche). */
export function apparierParNom(intituleSource: string, candidats: CandidatCompte[]): Appariement {
  let meilleur = -1;
  let second = -1;
  let cible: string | undefined;
  for (const c of candidats) {
    const s = scoreAppariement(intituleSource, c.intitule);
    if (s > meilleur) {
      second = meilleur;
      meilleur = s;
      cible = c.nomenclature;
    } else if (s > second) {
      second = s;
    }
  }
  if (meilleur < 0) return { confiance: 0, ambigu: false };
  const ambigu =
    second >= SEUIL_APPARIEMENT_MINI && meilleur - second < MARGE_AMBIGUITE;
  return { cible, confiance: meilleur, ambigu };
}

// --- Contexte eStale (referentiel des comptes existants de la copro cible) ---------

/** Ce que le resolveur a besoin de connaitre du plan comptable eStale de la copro. */
export interface ContexteEstale {
  /** Comptes 401 fournisseurs existants (nomenclature + nom). */
  fournisseurs: CandidatCompte[];
  /** Comptes 450 coproprietaires existants (nomenclature + nom, issus de l'injection patrimoine). */
  coproprietaires: CandidatCompte[];
  /** Nomenclature eStale du compte d'attente banque 471999 s'il existe. */
  nomenclature471999?: string;
  /** Nomenclature eStale du compte d'attente livret 471998 s'il existe. */
  nomenclature471998?: string;
}

// --- Resolution d'un compte -------------------------------------------------------

function cible(nomenclature: string): CibleMapping {
  return { nomenclature, cle: CLE_DEFAUT, journal: JOURNAL_REPRISE };
}

/** Options de resolution d'un compte (reglages qui dependent du reste du jeu, pas du compte seul). */
export interface OptionsMapperCompte {
  /**
   * Le compte appartient a un GROUPE HOMONYME (coproprietaire a comptes multiples) : l'appariement
   * automatique >= SEUIL_APPARIEMENT_FORT est DESACTIVE (ambigu par construction). Meme un match
   * parfait est retrograde en warning_appariement -> revue humaine obligatoire (pas de fusion
   * silencieuse ; l'humain choisit / cree un compte separe).
   */
  homonyme?: boolean;
  /**
   * LIAISON deja etablie (analyse unifiee) : nomenclature eStale du compte 450 de l'owner auquel
   * ce compte source est rattache. Quand elle est presente pour un coproprietaire, le mapping est
   * DETERMINISTE par la CLE compte->owner : statut "mappe", sans appariement par nom, MEME dans un
   * groupe homonyme (la revue humaine a deja tranche a l'analyse -> les homonymes sont distingues
   * par leur compte). C'est le gain de l'onboarding unifie sur l'appariement par nom apres coup.
   */
  liaisonNomenclature?: string;
}

/**
 * Resout UN compte source en une EntreeMapping, en appliquant sa regle metier. Pur : ne depend
 * que du compte, de son intitule, du referentiel eStale (ContexteEstale) et d'options - aucune I/O.
 */
export function mapperCompte(
  compteSource: string,
  intitule: string | undefined,
  contexte: ContexteEstale,
  options?: OptionsMapperCompte,
): EntreeMapping {
  const classe = (classeSafe(compteSource) ?? 4) as ClasseComptable;
  const categorie = classifierCompte(compteSource);
  const base = { compteSource, intitule, classe, categorie };

  switch (categorie) {
    case "fournisseur": {
      if (!intitule) {
        return {
          ...base,
          statut: "action_requise",
          action: { type: "creer_fournisseur" },
          note: "intitule source absent : nom du fournisseur a saisir avant creation",
        };
      }
      const ap = apparierParNom(intitule, contexte.fournisseurs);
      if (ap.cible && ap.confiance >= SEUIL_APPARIEMENT_FORT && !ap.ambigu) {
        return { ...base, statut: "mappe", confiance: ap.confiance, cible: cible(ap.cible) };
      }
      if (ap.cible && ap.confiance >= SEUIL_APPARIEMENT_MINI) {
        return {
          ...base,
          statut: "warning_appariement",
          confiance: ap.confiance,
          cible: cible(ap.cible),
          note: ap.ambigu ? "appariement fournisseur ambigu" : "appariement fournisseur faible",
        };
      }
      // Aucun candidat fiable : le fournisseur n'existe pas encore -> creation planifiee.
      return {
        ...base,
        statut: "action_requise",
        confiance: ap.confiance,
        action: { type: "creer_fournisseur", intituleSource: intitule },
      };
    }

    case "coproprietaire": {
      // LIAISON PRIORITAIRE : si l'owner de ce compte 450 est deja rattache (analyse unifiee,
      // revue humaine faite), on mappe par la CLE compte->owner. Deterministe, homonyme-proof :
      // aucun appariement par nom, court-circuite meme la desactivation du groupe homonyme.
      if (options?.liaisonNomenclature) {
        return {
          ...base,
          statut: "mappe",
          cible: cible(options.liaisonNomenclature),
          note: "liaison compte->owner (revue faite a l'analyse unifiee) : appariement par nom court-circuite",
        };
      }
      if (!intitule) {
        return {
          ...base,
          statut: "non_mappe",
          note: "intitule source absent : appariement coproprietaire impossible",
        };
      }
      const ap = apparierParNom(intitule, contexte.coproprietaires);
      // Groupe homonyme : on NE mappe JAMAIS automatiquement (meme un match parfait est ambigu
      // par construction - plusieurs comptes source portent le meme nom). Tout part en revue.
      if (options?.homonyme) {
        if (ap.cible && ap.confiance >= SEUIL_APPARIEMENT_MINI) {
          return {
            ...base,
            statut: "warning_appariement",
            confiance: ap.confiance,
            cible: cible(ap.cible),
            note: "groupe homonyme : appariement automatique desactive, revue humaine requise",
          };
        }
        return {
          ...base,
          statut: "non_mappe",
          confiance: ap.confiance,
          note: "groupe homonyme sans candidat fiable : revue humaine requise (compte separe ou choix manuel)",
        };
      }
      if (ap.cible && ap.confiance >= SEUIL_APPARIEMENT_FORT && !ap.ambigu) {
        return { ...base, statut: "mappe", confiance: ap.confiance, cible: cible(ap.cible) };
      }
      if (ap.cible && ap.confiance >= SEUIL_APPARIEMENT_MINI) {
        return {
          ...base,
          statut: "warning_appariement",
          confiance: ap.confiance,
          cible: cible(ap.cible),
          note: ap.ambigu
            ? "appariement coproprietaire ambigu"
            : "appariement coproprietaire faible",
        };
      }
      // Aucun owner apparie : bloc A non mappe et sans action possible ici (owners crees a
      // l'injection patrimoine) -> ERREUR bloquante, a resoudre par un humain.
      return {
        ...base,
        statut: "non_mappe",
        confiance: ap.confiance,
        note: "aucun coproprietaire eStale apparie (verifier l'injection patrimoine ou le nom)",
      };
    }

    case "banque": {
      if (contexte.nomenclature471999) {
        return { ...base, statut: "mappe", cible: cible(contexte.nomenclature471999) };
      }
      return {
        ...base,
        statut: "action_requise",
        action: { type: "creer_sous_compte", parent: "471", suffix: "999", nom: "Banque Ancien Syndic" },
      };
    }

    case "livret": {
      if (contexte.nomenclature471998) {
        return { ...base, statut: "mappe", cible: cible(contexte.nomenclature471998) };
      }
      return {
        ...base,
        statut: "action_requise",
        action: { type: "creer_sous_compte", parent: "471", suffix: "998", nom: "Livret Ancien Syndic" },
      };
    }

    case "attente_ancien":
      return {
        ...base,
        statut: "mappe",
        cible: cible(cible471vers472(compteSource)),
        note: "compte d'attente ancien syndic (471) repris en 472",
      };

    case "attente_472":
      return { ...base, statut: "mappe", cible: cible(racineCompte(compteSource)) };

    case "fnp_408":
      return {
        ...base,
        statut: "mappe",
        cible: cible(racineCompte(compteSource)),
        note: "factures non parvenues (408) reprises telles quelles",
      };

    case "regularisation_489":
      return {
        ...base,
        statut: "mappe",
        cible: cible(racineCompte(compteSource)),
        note: "compte 489 : souvent NON repris si le grand livre s'equilibre sans lui - a confirmer",
      };

    case "autre_bloc_a":
      return {
        ...base,
        statut: "mappe",
        cible: cible(racineCompte(compteSource)),
        note: "compte de tiers/tresorerie (bloc A) repris tel quel - verifier la nomenclature eStale",
      };

    case "charge_bloc_b":
      return {
        ...base,
        statut: "reporte_bloc_b",
        cible: cible(racineCompte(compteSource)),
        note: "classe 6 (charges) : bloc B, importe a l'increment 4 (RGD avec TVA)",
      };

    case "hors_bloc_a":
    default:
      return {
        ...base,
        statut: "reporte_bloc_c",
        note: `classe ${classe} hors bloc A : bloc C (eclatement 1/7) a l'increment 5`,
      };
  }
}

// --- Agregation en plan -----------------------------------------------------------

/** Compte-rendu vide (toutes les cles de statut a 0). */
function compteursVides(): Record<StatutMapping, number> {
  return {
    mappe: 0,
    action_requise: 0,
    warning_appariement: 0,
    reporte_bloc_b: 0,
    reporte_bloc_c: 0,
    non_mappe: 0,
  };
}

/**
 * Assemble les entrees en PlanMapping : compteurs, erreurs (bloc A non mappe), warnings
 * (appariements a valider), notes (489/reports), et le verdict pretAImporter.
 * GARDE-FOU : pretAImporter = aucune erreur ET aucun warning.
 */
export function construirePlan(entrees: EntreeMapping[]): PlanMapping {
  const compteurs = compteursVides();
  const erreurs: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  for (const e of entrees) {
    compteurs[e.statut]++;
    if (e.statut === "non_mappe") {
      erreurs.push(
        `compte ${e.compteSource} (classe ${e.classe}, ${e.categorie}) : bloc A non mappe et sans action planifiee -> ERREUR bloquante` +
          (e.note ? ` [${e.note}]` : ""),
      );
    } else if (e.statut === "warning_appariement") {
      warnings.push(
        `compte ${e.compteSource} (${e.categorie}) : appariement a valider, confiance ${
          e.confiance !== undefined ? e.confiance.toFixed(2) : "?"
        }` + (e.note ? ` [${e.note}]` : ""),
      );
    } else if (e.categorie === "regularisation_489") {
      notes.push(`compte ${e.compteSource} : 489 present -> decider s'il est repris (cf. equilibre).`);
    }
  }

  const pretAImporter = erreurs.length === 0 && warnings.length === 0;
  return { entrees, compteurs, erreurs, warnings, notes, pretAImporter };
}

/**
 * Applique le GARDE-FOU avant-repartition a un plan : si le verdict est bloquant (au moins un
 * compte de classe 6/7 avec report non nul), attache le verdict, PREPEND l'erreur bloquante et
 * force pretAImporter = false. Bloquant STRICT : aucun override. Renvoie le plan inchange si le
 * verdict n'est pas bloquant (retro-compatible). Pur : ne mute pas le plan d'entree.
 */
export function appliquerAvantRepartition(
  plan: PlanMapping,
  verdict: VerdictAvantRepartition,
): PlanMapping {
  if (!verdict.avantRepartition) return plan;
  // Degradation ARITHMETIQUE (regle Sekou 2026-08-18) : la preuve par la balance de bascule
  // (reproduite au centime) transforme le blocage en AVERTISSEMENT - jamais en silence.
  if (verdict.degradeParPreuve?.reproduite) {
    return {
      ...plan,
      avantRepartition: verdict,
      warnings: [messageDegradationBascule(verdict, verdict.degradeParPreuve), ...plan.warnings],
    };
  }
  return {
    ...plan,
    avantRepartition: verdict,
    erreurs: [messageAvantRepartition(verdict), ...plan.erreurs],
    pretAImporter: false,
  };
}

/**
 * Applique le CONTROLE CROISE (raccordement cloture <-> en cours) a un plan : si le verdict n'est
 * PAS raccorde, attache le verdict, PREPEND l'erreur bloquante et force pretAImporter = false.
 * Bloquant STRICT : aucun geste humain ne le leve (il faut le bon grand livre). Renvoie le plan
 * inchange si le raccordement est bon (retro-compatible). Pur : ne mute pas le plan d'entree.
 */
export function appliquerRaccordement(
  plan: PlanMapping,
  verdict: VerdictRaccordement,
): PlanMapping {
  if (verdict.raccorde) return plan;
  return {
    ...plan,
    raccordement: verdict,
    erreurs: [messageRaccordement(verdict), ...plan.erreurs],
    pretAImporter: false,
  };
}

// --- Groupes homonymes (coproprietaires a comptes multiples) -----------------------

/** Un compte source avec son intitule (entree du resolveur). */
export interface CompteSource {
  compte: string;
  intitule?: string;
}

/**
 * Detecte les GROUPES HOMONYMES : comptes source 450 (coproprietaire) partageant le MEME nom
 * normalise (normaliserNom). Un groupe = au moins 2 comptes. C'est le cas metier de la reprise
 * reelle : un coproprietaire apparait sur plusieurs comptes 450 (tous prefixe 4501, indiscernables
 * par le nom). Pur : ne lit que la liste des comptes source. PII-free (ne renvoie que des numeros).
 */
export function detecterGroupesHomonymes(comptes: CompteSource[]): GroupeHomonymes[] {
  const parNom = new Map<string, string[]>();
  for (const { compte, intitule } of comptes) {
    if (!intitule) continue;
    if (classifierCompte(compte) !== "coproprietaire") continue;
    const cle = normaliserNom(intitule);
    if (!cle) continue;
    const arr = parNom.get(cle) ?? [];
    arr.push(compte);
    parNom.set(cle, arr);
  }
  const groupes: GroupeHomonymes[] = [];
  for (const membres of parNom.values()) {
    if (membres.length >= 2) groupes.push({ comptes: membres });
  }
  return groupes;
}

/**
 * Resout une liste de comptes source en un PLAN complet : detecte les groupes homonymes,
 * DESACTIVE l'appariement automatique pour leurs membres (revue humaine forcee), mappe chaque
 * compte puis assemble le plan et y attache les groupes. C'est le point d'entree PUR du resolveur
 * (les services LIsent eStale puis delegent ici). Meme entree => meme sortie.
 */
/** Options de resolution d'un plan complet (au-dela du compte seul). */
export interface OptionsResoudre {
  /**
   * LIAISON compte source 450 -> nomenclature eStale de l'owner (issue de l'analyse unifiee, une
   * fois les owners injectes). Optionnelle : l'ecran mapping-compta standalone n'en fournit pas
   * (retro-compatible). Quand un compte y figure, il est mappe par la cle (sans appariement par
   * nom), meme homonyme.
   */
  liaisonParCompte?: Record<string, string>;
}

export function resoudreComptes(
  comptes: CompteSource[],
  contexte: ContexteEstale,
  options?: OptionsResoudre,
): PlanMapping {
  const groupes = detecterGroupesHomonymes(comptes);
  const indexParCompte = new Map<string, number>();
  groupes.forEach((g, i) => g.comptes.forEach((c) => indexParCompte.set(c, i)));

  const entrees = comptes.map(({ compte, intitule }) => {
    const idx = indexParCompte.get(compte);
    const liaisonNomenclature = options?.liaisonParCompte?.[compte];
    const e = mapperCompte(compte, intitule, contexte, { homonyme: idx !== undefined, liaisonNomenclature });
    return idx !== undefined ? { ...e, groupeHomonyme: idx } : e;
  });

  const plan = construirePlan(entrees);
  return groupes.length > 0 ? { ...plan, groupesHomonymes: groupes } : plan;
}
