// Service du bloc "AG - les plus urgentes" de l'accueil dossiers (variante C).
//
// SOURCE UNIQUE : le calcul du cycle AG vient de domain/cycle-ag (calculerCycleAg),
// LA source unique depuis la refonte S1/S2. On ne reinvente AUCUNE logique d'action ni
// d'echeance ici : chaque ligne du bandeau est DERIVEE d'`actionDuMoment` / `echeance` /
// `enRetard` du cycle (regle gravee : toute UI qui affiche une action du cycle la derive
// d'actionDuMoment, jamais en dur). Passe par le routeur, jamais un adapter en direct.
//
// Difference avec le cockpit : on ne garde QUE les copros IMMINENTES (echeance proche,
// en retard, ou suivi post-AG a mener), triees par urgence.
//
// --- Mapping CycleAg -> ligne de bandeau ---------------------------------------
//   actionDuMoment.action -> prochaineAction   (phrase, ex "préparer l'ODJ")
//   actionDuMoment.label  -> actionLabel        (texte du bouton, ex "ODJ")
//   actionDuMoment.href   -> lien               (cible du bouton = l'ACTION precise)
//   echeance              -> echeance           ("J-30", "à dater", "en retard"...)
//   enRetard              -> enRetard           (defaut de planification legale)
// Une copro dont le cycle n'a PLUS d'action (actionDuMoment null : cycle complet ou AG
// conclue-archivee) est ecartee du bandeau. Grace a calculerCycleAg, une AG tenue mais
// non conclue herite de "Conclure l'AG" (priorisation post-tenue S2) au lieu d'une action
// a contre-temps.

import type { Copropriete } from "@/lib/domain/copropriete";
import {
  calculerCycleAg,
  estDateeEnCycle,
  estEnParcours,
  type CycleAg,
} from "@/lib/domain/cycle-ag";
import type { StatutAg } from "@/lib/domain/supervision-ag";
import { getCoproRepository, getJalonRepository } from "@/lib/adapters/router";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";

// Fenetre "les plus urgentes" : on remonte une AG imminente jusqu'a J-21 (3 semaines)
// pour ne pas rater la prepa qui demarre, + tout ce qui est en retard, + le suivi
// post-AG (etat "tenue" : conclure / notifier le PV, toujours a mener). Choix v1 prudent
// (a affiner avec Sekou) : assez large pour ne rien manquer, assez serre pour rester un
// bandeau court (cap 5 cote UI).
const HORIZON_SEMAINE_JOURS = 21;

/** Une ligne du bandeau AG, entierement derivee du cycle AG de la copro. */
export interface AgSemaineLigne {
  id: string;
  coproCode: string;
  coproNom: string;
  /** Phrase d'action (cycle.actionDuMoment.action), ex "préparer l'ODJ". */
  prochaineAction: string;
  /** Texte du bouton (cycle.actionDuMoment.label), ex "ODJ", "Supervision". */
  actionLabel: string;
  /** Cible du bouton = l'action precise (cycle.actionDuMoment.href). */
  lien: string;
  /** Echeance courte (cycle.echeance), ex "J-30", "à dater", "en retard". */
  echeance?: string;
  /** Defaut de planification legale depasse (cycle.enRetard). */
  enRetard: boolean;
}

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function joursJMoins(echeance: string | undefined): number | null {
  const m = /^J-(\d+)$/.exec(echeance ?? "");
  return m ? Number(m[1]) : null;
}

// Une copro est-elle a porter au bandeau ? (elle a une action a mener ET elle presse)
function estImminent(cycle: CycleAg): boolean {
  if (cycle.actionDuMoment === null) return false; // rien a faire -> hors bandeau
  if (cycle.enRetard) return true; // retard de planification legale
  if (cycle.etat === "tenue") return true; // suivi post-AG (conclure / notifier PV)
  const jMoins = joursJMoins(cycle.echeance);
  if (jMoins !== null) return jMoins <= HORIZON_SEMAINE_JOURS; // echeance datee proche
  return cycle.echeance === "à dater"; // AG non datee dans la fenetre legale d'approbation
}

// Clef de tri par urgence (plus petit = plus urgent). Derivee du seul cycle : retard
// d'abord, puis les echeances datees par nombre de jours, puis le suivi post-AG, puis les
// planifications non datees. Les non-imminents sont deja ecartes en amont.
function urgence(cycle: CycleAg): number {
  if (cycle.enRetard) return 0;
  const jMoins = joursJMoins(cycle.echeance);
  if (jMoins !== null) return 1 + jMoins;
  if (cycle.etat === "tenue") return 900;
  if (cycle.echeance === "à dater") return 1000;
  return 9999;
}

function versLigne(c: Copropriete, cycle: CycleAg): AgSemaineLigne | null {
  const action = cycle.actionDuMoment;
  if (!action) return null;
  return {
    id: `ag-${c.code}`,
    coproCode: c.code,
    coproNom: c.nom,
    prochaineAction: action.action,
    actionLabel: action.label,
    lien: action.href,
    enRetard: cycle.enRetard,
    ...(cycle.echeance ? { echeance: cycle.echeance } : {}),
  };
}

/**
 * Les AG du gestionnaire qui demandent une action imminente (echeance proche, en retard,
 * ou suivi post-AG a mener), triees par urgence. Vide si rien d'imminent -> le bloc se
 * masque cote UI.
 */
export async function getAgSemaine(managerId: string): Promise<AgSemaineLigne[]> {
  const today = aujourdhuiISO();
  const copros = await getCoproRepository().list(managerId);

  // Etat des jalons lu UNE fois (lecture groupee), pour les copros datees en cycle.
  const dateesEnCycle = copros.filter((c) => estDateeEnCycle(c, today));
  const etats = await getJalonRepository().getEtats(dateesEnCycle.map((c) => c.code));
  const accompliPar = new Map<string, Set<string>>();
  for (const e of etats) {
    if (e.statut !== "accompli") continue;
    const k = `${e.coproCode}|${e.agDate}`;
    (accompliPar.get(k) ?? accompliPar.set(k, new Set()).get(k)!).add(e.type);
  }

  const candidates = copros.filter((c) => estEnParcours(c, today));

  const lignes: { ligne: AgSemaineLigne; cycle: CycleAg }[] = [];
  for (const c of candidates) {
    const accompli = accompliPar.get(`${c.code}|${c.prochaineAg?.date}`) ?? new Set<string>();
    // Statut de supervision : SEULEMENT pour une AG DATEE deja passee (tenue non conclue).
    // Il distingue "Conclure l'AG" (en_preparation) de "cycle termine" (conclue_archivee),
    // exactement comme la fiche copro (get-fiche-copro). Aucun appel hors de ce cas etroit.
    let statut: StatutAg | undefined;
    if (c.prochaineAg?.date && c.prochaineAg.date < today) {
      const sup = await getSupervisionAg(`${c.code}__${c.prochaineAg.date}`, managerId);
      statut = sup?.statut;
    }
    const cycle = calculerCycleAg(c, accompli, today, statut);
    if (!estImminent(cycle)) continue;
    const ligne = versLigne(c, cycle);
    if (ligne) lignes.push({ ligne, cycle });
  }

  return lignes
    .sort(
      (a, b) =>
        urgence(a.cycle) - urgence(b.cycle) || a.ligne.coproCode.localeCompare(b.ligne.coproCode),
    )
    .map(({ ligne }) => ligne);
}
