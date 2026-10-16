// Le NIVEAU d'un cycle de suivi : vert, orange, rouge, ou « à compléter ». Fonctions pures.
//
// Règle validée par les directeurs (06/06/2026) et reprise telle quelle : rouge = DOSSIER FIGÉ,
// pas échéance imminente. Une fenêtre de suivi s'ouvre à « échéance moins N jours » (180 pour
// l'assurance, 90 pour le gaz, 120 pour les CTQ). À partir de là, un compteur court depuis le
// plus récent de : l'ouverture de la fenêtre, la dernière étape intermédiaire datée. Trente
// jours sans étape : orange ; soixante : rouge. Franchir une étape remet le compteur à zéro.
// Une copro dont l'échéance est dans cinq jours mais qui a progressé hier reste verte.
//
// Pas d'échéance saisie = « à compléter », jamais vert par défaut : c'est la file de qualité
// de données, pas un faux sentiment de sécurité. Le niveau se calcule, il ne se stocke jamais
// (la colonne alertLevel de l'ancienne base n'est plus lue).

import { joursEntre, plusJours } from "./dates";
import { ETAPES, etapesIntermediaires, type Cycle, type DatesEtapes, type EtapeDef, type Niveau, type NiveauQualifie, type RegleRelance, type SujetSuivi } from "./types";

/** Jour où la fenêtre de suivi s'ouvre : l'échéance moins le premier rappel. */
export function debutFenetre(echeanceISO: string, regle: RegleRelance): string {
  return plusJours(echeanceISO, -regle.premierRappelJours);
}

/** La plus récente des étapes INTERMÉDIAIRES datées (ni terminale, ni post-terminale). */
export function derniereEtapeIntermediaireISO(sujet: SujetSuivi, etapes: DatesEtapes): string | null {
  let max: string | null = null;
  for (const e of etapesIntermediaires(sujet)) {
    const d = etapes[e.cle];
    if (d && (max === null || d > max)) max = d;
  }
  return max;
}

/** Le jour d'où part le compteur de figement : max(ouverture de la fenêtre, dernière étape). */
export function departCompteur(sujet: SujetSuivi, echeanceISO: string, etapes: DatesEtapes, regle: RegleRelance): string {
  const debut = debutFenetre(echeanceISO, regle);
  const derniere = derniereEtapeIntermediaireISO(sujet, etapes);
  return derniere && derniere > debut ? derniere : debut;
}

/**
 * Jours écoulés sans avancement, une fois la fenêtre ouverte. null si le cycle n'a pas
 * d'échéance ou si la fenêtre n'est pas encore ouverte (il n'y a alors rien à compter).
 */
export function joursSansAvancement(
  cycle: Pick<Cycle, "sujet" | "echeanceISO" | "etapes">,
  regle: RegleRelance,
  aujourdhuiISO: string,
): number | null {
  if (!cycle.echeanceISO) return null;
  if (debutFenetre(cycle.echeanceISO, regle) > aujourdhuiISO) return null;
  return joursEntre(departCompteur(cycle.sujet, cycle.echeanceISO, cycle.etapes, regle), aujourdhuiISO);
}

/** Le niveau d'un cycle au jour dit. */
export function niveauCycle(
  cycle: Pick<Cycle, "sujet" | "echeanceISO" | "etapes">,
  regle: RegleRelance,
  aujourdhuiISO: string,
): NiveauQualifie {
  const ecoules = joursSansAvancement(cycle, regle, aujourdhuiISO);
  if (ecoules === null) return cycle.echeanceISO ? "vert" : "a_completer";
  if (ecoules >= regle.rougeJours) return "rouge";
  if (ecoules >= regle.orangeJours) return "orange";
  return "vert";
}

const RANG: Record<Niveau, number> = { vert: 0, orange: 1, rouge: 2 };

/**
 * Le badge d'une copro : le PIRE niveau qualifiable de ses cycles. « À compléter » ne masque
 * rien et n'est masqué par rien, il se compte à part. null si aucun cycle n'est qualifiable.
 */
export function pireNiveau(niveaux: readonly NiveauQualifie[]): Niveau | null {
  let pire: Niveau | null = null;
  for (const n of niveaux) {
    if (n === "a_completer") continue;
    if (pire === null || RANG[n] > RANG[pire]) pire = n;
  }
  return pire;
}

/** Un cycle n'est « à compléter » que s'il n'a pas d'échéance ET qu'il est encore en cours. */
export function estACompleterActif(c: Pick<Cycle, "echeanceISO" | "statut">): boolean {
  return c.echeanceISO === null && c.statut === "en_cours";
}

/**
 * Cycle d'amorçage « à démarrer » : en cours, jamais démarré à la main, aucune étape datée et
 * aucune activité (offre, devis, document : l'appelant le sait, pas le cycle). Replié à
 * l'écran tant qu'on n'a pas cliqué « Démarrer le suivi ».
 */
export function estCycleADemarrer(c: Pick<Cycle, "statut" | "demarreManuellement" | "etapes">, aActivite: boolean): boolean {
  if (c.statut !== "en_cours" || c.demarreManuellement === true || aActivite) return false;
  return !Object.values(c.etapes).some((d) => !!d);
}

export interface Progression {
  /** Étapes datées, hors post-terminales. */
  franchies: number;
  /** Étapes qui comptent (hors post-terminales). */
  total: number;
  /** La dernière étape datée dans l'ordre métier (post-terminales comprises) ; null si aucune. */
  etapeCourante: EtapeDef | null;
}

export function progression(sujet: SujetSuivi, etapes: DatesEtapes): Progression {
  let franchies = 0;
  let total = 0;
  let etapeCourante: EtapeDef | null = null;
  for (const e of ETAPES[sujet]) {
    const datee = !!etapes[e.cle];
    if (!e.postTerminale) {
      total += 1;
      if (datee) franchies += 1;
    }
    if (datee) etapeCourante = e;
  }
  return { franchies, total, etapeCourante };
}
