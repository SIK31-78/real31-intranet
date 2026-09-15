// Le pipeline : filtrer, trier, mesurer les propositions. Fonctions pures.
//
// Le taux de transformation se mesure sur une FENETRE GLISSANTE DE 3 ANS : au-dela,
// l'Excel d'origine a ete « nettoye » (tout passe en refuse), les chiffres ne veulent
// plus rien dire (Sekou, 15/09/2026).

import { normaliser } from "./rapprochement";
import { LIBELLE_ORIGINE, LIBELLE_STATUT, STATUTS_OUVERTS, type Origine, type Proposition, type StatutProposition } from "./proposition";

export const FENETRE_TRANSFORMATION_ANNEES = 3;

export interface FiltrePipeline {
  /**
   * Texte libre, UNE barre pour tout (Sekou, 15/09/2026 : des barres de recherche plutot
   * que des listes deroulantes) : adresse, commune, contact, immatriculation, mais aussi
   * agence (« LGC »), gestionnaire, origine, statut et annee du premier contact.
   */
  texte?: string;
  /** « ouvertes » (defaut), « toutes », ou un statut precis. */
  statut?: StatutProposition | "ouvertes" | "toutes";
  agence?: string;
  gestionnaire?: string;
  origine?: Origine;
  /** Annee du premier contact. */
  annee?: number;
}

export type CleTri = "date" | "lots" | "honoraires" | "adresse" | "maj";

export interface TriPipeline {
  cle: CleTri;
  sens: "asc" | "desc";
}

export const TRI_PAR_DEFAUT: TriPipeline = { cle: "date", sens: "desc" };

/** La date qui situe une proposition dans le temps : le premier contact, sinon la creation. */
export function dateReference(p: Proposition): string {
  return p.premierContactISO ?? p.creeLeISO.slice(0, 10);
}

export function filtrer(propositions: Proposition[], f: FiltrePipeline): Proposition[] {
  const statut = f.statut ?? "ouvertes";
  const texte = f.texte ? normaliser(f.texte) : "";
  return propositions.filter((p) => {
    if (statut === "ouvertes" && !STATUTS_OUVERTS.has(p.statut)) return false;
    if (statut !== "ouvertes" && statut !== "toutes" && p.statut !== statut) return false;
    if (f.agence && p.agence !== f.agence) return false;
    if (f.gestionnaire && p.gestionnaire !== f.gestionnaire) return false;
    if (f.origine && p.origine !== f.origine) return false;
    if (f.annee && Number(dateReference(p).slice(0, 4)) !== f.annee) return false;
    if (texte) {
      const corpus = normaliser(
        [
          p.immeuble.adresse,
          p.immeuble.commune,
          p.immeuble.immatriculation,
          p.contact.nom,
          p.contact.email,
          p.commentaires,
          p.agence,
          p.gestionnaire,
          p.origine ? LIBELLE_ORIGINE[p.origine] : null,
          LIBELLE_STATUT[p.statut],
          dateReference(p).slice(0, 4),
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!texte.split(" ").every((m) => corpus.includes(m))) return false;
    }
    return true;
  });
}

export function trier(propositions: Proposition[], tri: TriPipeline = TRI_PAR_DEFAUT): Proposition[] {
  const sens = tri.sens === "asc" ? 1 : -1;
  const cle = (p: Proposition): string | number => {
    switch (tri.cle) {
      case "date":
        return dateReference(p);
      case "maj":
        return p.majLeISO;
      case "lots":
        return p.immeuble.lotsPrincipaux ?? -1;
      case "honoraires":
        return p.prix.honorairesTtc ?? -1;
      case "adresse":
        return normaliser(p.immeuble.adresse);
    }
  };
  return [...propositions].sort((a, b) => {
    const x = cle(a), y = cle(b);
    if (x === y) return 0;
    return (x < y ? -1 : 1) * sens;
  });
}

export interface Transformation {
  /** Debut de la fenetre (ISO), pour l'afficher. */
  depuisISO: string;
  elues: number;
  /** Elues + refusees par le CS ou l'AG (les refus REAL 31 ne comptent pas : on n'a pas concouru). */
  decidees: number;
  /** En pourcent, arrondi ; null si rien n'a ete decide. */
  taux: number | null;
}

/**
 * Le taux de transformation sur les N dernieres annees : elues / (elues + refus CS + refus AG),
 * datees par la decision (sinon le premier contact).
 */
export function transformation(propositions: Proposition[], aujourdHuiISO: string, annees = FENETRE_TRANSFORMATION_ANNEES): Transformation {
  const depuis = new Date(aujourdHuiISO);
  depuis.setUTCFullYear(depuis.getUTCFullYear() - annees);
  const depuisISO = depuis.toISOString().slice(0, 10);
  let elues = 0, decidees = 0;
  for (const p of propositions) {
    if (!["elu", "refuse_cs", "refuse_ag"].includes(p.statut)) continue;
    const quand = p.decisionISO ?? dateReference(p);
    if (quand < depuisISO) continue;
    decidees++;
    if (p.statut === "elu") elues++;
  }
  return { depuisISO, elues, decidees, taux: decidees ? Math.round((elues / decidees) * 100) : null };
}

/** Les valeurs distinctes d'un champ, pour remplir les filtres. */
export function valeursDistinctes(propositions: Proposition[], champ: "agence" | "gestionnaire"): string[] {
  return [...new Set(propositions.map((p) => p[champ]).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "fr"));
}

export function anneesDistinctes(propositions: Proposition[]): number[] {
  return [...new Set(propositions.map((p) => Number(dateReference(p).slice(0, 4))))].filter((a) => a > 2000).sort((a, b) => b - a);
}
