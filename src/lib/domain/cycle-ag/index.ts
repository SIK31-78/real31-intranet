// ============================================================================
// CYCLE AG - LA source unique de l'etat du cycle AG d'une copro (S1 refonte,
// decision Sekou 2026-07-21).
//
// Avant ce module, DEUX modeles paralleles coexistaient sans qu'aucun gouverne
// l'app : l'ETAT du cycle (etat-cycle-ag : a_planifier / a_venir / en_preparation
// / convoquee / tenue) et l'ETAPE de parcours (parcours-ag : dates / odj / convoc
// / tenue / pv + action). Ils sont desormais DEUX PROJECTIONS du meme calcul
// (`calculerCycleAg`), plus jamais deux calculs. Les anciens fichiers
// domain/etat-cycle-ag.ts et domain/parcours-ag.ts sont de simples re-exports.
//
// >>> REGLE GRAVEE (socle de la refonte) <<<
// Les CTA du cycle AG sont pilotes par l'etat - un bouton n'apparait jamais a
// contre-temps. Toute UI qui affiche une action du cycle DOIT la deriver
// d'`actionDuMoment`, jamais la coder en dur.
// ============================================================================

import type { Copropriete } from "@/lib/domain/copropriete";
import { etatCycleAg, type EtatCycle } from "./etat";
import {
  construireLigne,
  etapesCompletes,
  type CodeEtape,
  type EtapeParcours,
} from "./parcours";

// Les deux anciens vocabulaires, re-exportes depuis LA source unique.
export {
  etatCycleAg,
  ETAT_CYCLE_LABEL,
  ETAT_CYCLE_ORDRE,
  type EtatCycle,
  type EtatCycleInfo,
} from "./etat";
export {
  agDueDeadline,
  agTenuePourExerciceCourant,
  construireLigne,
  estDateeEnCycle,
  estEnParcours,
  etapesCompletes,
  PARCOURS_HORIZON,
  PARCOURS_RETRO,
  type CodeEtape,
  type EtapeParcours,
  type LigneParcours,
  type StatutEtape,
} from "./parcours";

/** L'action du moment d'une copro dans son cycle AG : LE bouton legitime. */
export interface ActionDuMoment {
  /** Phrase d'action, ex "préparer l'ODJ". */
  action: string;
  /** Libelle court du bouton, ex "ODJ", "Fixer", "Supervision". */
  label: string;
  /** Cible du bouton. */
  href: string;
}

/**
 * Le cycle AG d'une copro, en UN calcul : l'etat (pipeline / kanban), l'etape de
 * parcours (frise), l'action du moment (CTA), l'echeance et le retard.
 */
export interface CycleAg {
  /** Etat du cycle (vocabulaire pipeline) : a_planifier .. tenue. */
  etat: EtatCycle;
  /** Delai legal d'AG depasse (pertinent pour a_planifier). */
  enRetard: boolean;
  /** Les 5 etapes du parcours, toujours dans l'ordre (vocabulaire frise). */
  etapes: EtapeParcours[];
  /** Etape courante ; null si le cycle est complet (rien a faire). */
  etapeCourante: CodeEtape | null;
  /** L'action du moment ; null si rien a faire (cycle complet ou AG conclue). */
  actionDuMoment: ActionDuMoment | null;
  /** Echeance courte de l'etape courante, ex "J-30", "à dater", "en retard". */
  echeance?: string;
}

/**
 * LE calcul unique du cycle AG d'une copro. `accompli` = codes des jalons marques
 * accomplis pour la copro + son AG courante (dont "CONVOC", qui pilote l'etat
 * "convoquee" - coche explicite, decision Sekou).
 *
 * Reutilise les regles EXISTANTES (etatCycleAg + construireLigne) : fusion, pas
 * reecriture. Seul ajout : une AG deja tenue et conclue (prochaine date videe)
 * n'a PLUS d'action - construireLigne seul proposerait "Fixer les dates" a
 * contre-temps alors qu'il n'y a rien a planifier avant la prochaine cloture.
 */
export function calculerCycleAg(
  c: Copropriete,
  accompli: Set<string>,
  today: string,
): CycleAg {
  const { etat, enRetard } = etatCycleAg(c, accompli.has("CONVOC"), today);

  // AG de l'exercice deja tenue et conclue (prochaine date videe) : cycle termine
  // pour cet exercice. Aucune action avant la prochaine cloture ; le suivi fin du
  // PV d'une AG conclue reste porte par sa supervision archivee, pas par le cycle.
  if (etat === "tenue" && !c.prochaineAg?.date) {
    return { etat, enRetard, etapes: etapesCompletes(), etapeCourante: null, actionDuMoment: null };
  }

  const r = construireLigne(c, accompli, today);
  if (!r) {
    // Cycle complet (les 5 etapes faites) : rien a faire.
    return { etat, enRetard, etapes: etapesCompletes(), etapeCourante: null, actionDuMoment: null };
  }

  const { ligne } = r;
  const courante = ligne.etapes.find((e) => e.statut === "encours");
  return {
    etat,
    enRetard,
    etapes: ligne.etapes,
    etapeCourante: courante?.code ?? null,
    actionDuMoment: {
      action: ligne.prochaineAction,
      label: ligne.actionLabel,
      href: ligne.lien,
    },
    ...(ligne.echeance ? { echeance: ligne.echeance } : {}),
  };
}
