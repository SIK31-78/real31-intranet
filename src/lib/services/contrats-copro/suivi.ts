// Les gestes de SUIVI du module « Contrats & contrôles » (REA-333) : dater ou effacer une
// étape, démarrer un suivi, définir une échéance, clôturer un cycle, corriger le contrat
// courant, créer ou modifier un appareil. Les règles (D3 à D13 des directeurs) vivent dans le
// domaine (cycle.ts) ; ici on charge, on vérifie le périmètre (ADR-041), on applique le verdict
// du domaine, on écrit, on journalise.
//
// Ordre fixe d'un geste : exigerPerimetre -> lecture -> verdict -> écriture -> journal. Un
// refus métier est une Error au message français, rendue telle quelle par actionGestionnaire.
// Pas de transaction multi-tables en supabase-js : l'adapter écrit le geste principal d'abord
// (le cycle), les reports (contrat courant, appareil) ensuite, le journal en dernier.

import { getContratsCoproRepository } from "@/lib/adapters/router";
import {
  cycleInitial,
  demarrer,
  DUREE_CTQ_ANNEES,
  estJourISO,
  ETAPES,
  heritageOffreAssurance,
  heritageOffreGaz,
  LIBELLE_SUJET,
  peutEffacerEtape,
  plusAnnees,
  preparerCloture,
  verifierDateEtape,
  type Ascenseur,
  type Cycle,
  type EtapeDef,
  type OffreAssurance,
  type OffreGaz,
  type PatchContratCourant,
  type SujetSuivi,
} from "@/lib/domain/contrats-copro";
import type { ContratsCoproRepository } from "@/lib/ports/contrats-copro-repository";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { jourParis } from "@/lib/services/date-du-jour";
import { journaliser } from "./journal";
import { courtiersPartenaires, estChezCourtierPartenaire } from "./lecture";
import type { AuteurContrats } from "./types";

// --- Outils communs ----------------------------------------------------------------------

function signature(auteur: AuteurContrats): { parUserId: string; parNom: string } {
  return { parUserId: auteur.id, parNom: auteur.nom };
}

/** Le cycle demandé, qui doit exister ET appartenir à la copro du geste (pas de saut de copro). */
async function chargerCycle(repo: ContratsCoproRepository, coproCode: string, sujet: SujetSuivi, cycleId: string): Promise<Cycle> {
  const cycle = await repo.getCycle(sujet, cycleId);
  if (!cycle) throw new Error("Ce cycle de suivi est introuvable : la page a peut-être changé, recharge-la.");
  if (cycle.coproCode !== coproCode) throw new Error("Ce cycle de suivi n'appartient pas à cette copropriété.");
  return cycle;
}

async function chargerAppareil(repo: ContratsCoproRepository, coproCode: string, ascenseurId: string): Promise<Ascenseur> {
  const a = await repo.getAscenseur(ascenseurId);
  if (!a) throw new Error("Cet appareil est introuvable.");
  if (a.coproCode !== coproCode) throw new Error("Cet appareil n'est pas un ascenseur de cette copropriété.");
  return a;
}

function definitionEtape(sujet: SujetSuivi, cle: string): EtapeDef {
  const def = ETAPES[sujet].find((e) => e.cle === cle);
  if (!def) throw new Error(`Étape inconnue pour le suivi « ${LIBELLE_SUJET[sujet]} ».`);
  return def;
}

function refuserTerminale(def: EtapeDef): void {
  if (def.terminale) {
    throw new Error(`Pour dater « ${def.libelle} », utilise « Clôturer » : c'est cette étape qui clôt le cycle et ouvre le suivant.`);
  }
}

/** Les cycles EN COURS d'un sujet pour une copro, restreints à un appareil s'il est donné. */
async function cyclesEnCours(repo: ContratsCoproRepository, coproCode: string, sujet: SujetSuivi, ascenseurId?: string): Promise<Cycle[]> {
  const cycles = await repo.listerCycles({ coproCodes: [coproCode], sujets: [sujet], statuts: ["en_cours"] });
  return ascenseurId ? cycles.filter((c) => c.ascenseurId === ascenseurId) : cycles;
}

/** Même appareil (CTQ ascenseur) ; pour les autres sujets, les deux sont sans appareil. */
function memeAppareil(a: Cycle, b: Cycle): boolean {
  return (a.ascenseurId ?? null) === (b.ascenseurId ?? null);
}

/**
 * Le cycle EN COURS qui suit `cycle` (même sujet, même copro, même appareil), c'est-à-dire
 * créé APRÈS lui. null s'il n'y en a pas : c'est une première clôture, le suivant sera créé.
 * Aucun repli sur « le plus récent quel qu'il soit » : un cycle en cours créé AVANT le cycle
 * qu'on clôt n'est pas son suivant, et l'ajuster en silence maquillerait une incohérence.
 */
async function suivantDe(repo: ContratsCoproRepository, cycle: Cycle): Promise<Cycle | null> {
  const apres = (await cyclesEnCours(repo, cycle.coproCode, cycle.sujet, cycle.ascenseurId)).filter((c) => c.id !== cycle.id && c.creeLeISO > cycle.creeLeISO);
  if (apres.length === 0) return null;
  return apres.sort((a, b) => (a.creeLeISO < b.creeLeISO ? 1 : -1))[0];
}

/**
 * Re-clôture (D4) : seulement sur le DERNIER cycle clos du sujet (même copro, même appareil).
 * Re-clôturer un cycle plus ancien ferait bouger l'échéance d'un suivant qui n'est pas le sien.
 */
async function exigerDernierClos(repo: ContratsCoproRepository, cycle: Cycle): Promise<void> {
  const clos = await repo.listerCycles({ coproCodes: [cycle.coproCode], sujets: [cycle.sujet], statuts: ["clos"] });
  if (clos.some((c) => c.id !== cycle.id && memeAppareil(c, cycle) && c.creeLeISO > cycle.creeLeISO)) {
    throw new Error("Seul le dernier cycle clos peut être re-clôturé.");
  }
}

function echeanceDepuisDernierCtq(dernierCtqISO: string | null): string | null {
  return dernierCtqISO ? plusAnnees(dernierCtqISO, DUREE_CTQ_ANNEES) : null;
}

/** Jour ISO valide ou null ; tout le reste est refusé avec le nom du champ. */
function jourOuNull(valeur: string | null | undefined, champ: string): string | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (!estJourISO(valeur)) throw new Error(`${champ} illisible : attendu un jour au format AAAA-MM-JJ.`);
  return valeur;
}

// --- Dater / effacer une étape -----------------------------------------------------------

export interface DaterEtapeInput {
  coproCode: string;
  sujet: SujetSuivi;
  cycleId: string;
  etape: string;
  /** null = dé-cocher l'étape (D7 : intermédiaires et post-terminales seulement). */
  dateISO: string | null;
  aujourdhuiISO: string;
}

/**
 * Date une étape (ou l'efface). La TERMINALE passe par `cloturerCycle`, jamais par ici. Un
 * cycle clos reste éditable sur ses autres étapes (D9) ; un cycle archivé ne bouge plus.
 */
export async function daterEtape(p: DaterEtapeInput, auteur: AuteurContrats): Promise<Cycle> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const def = definitionEtape(p.sujet, p.etape);
  refuserTerminale(def);
  const cycle = await chargerCycle(repo, p.coproCode, p.sujet, p.cycleId);
  if (cycle.statut === "archive") throw new Error("Ce suivi est archivé : ses étapes ne se modifient plus.");

  const ancienne = cycle.etapes[def.cle] ?? null;
  const etapes = { ...cycle.etapes };

  if (p.dateISO === null) {
    if (!peutEffacerEtape(p.sujet, def.cle)) throw new Error(`L'étape « ${def.libelle} » ne se dé-coche pas : elle se re-date.`);
    delete etapes[def.cle];
  } else {
    const erreur = verifierDateEtape(p.dateISO, p.aujourdhuiISO);
    if (erreur) throw new Error(erreur);
    etapes[def.cle] = p.dateISO;
  }

  const sauve: Cycle = { ...cycle, etapes };
  await repo.sauverCycle(sauve);
  await journaliser({
    coproCode: p.coproCode,
    sujet: p.sujet,
    cycleId: cycle.id,
    type: p.dateISO === null ? "etape_effacee" : "etape_datee",
    ...signature(auteur),
    details: p.dateISO === null ? { etape: def.cle, ancienneDateISO: ancienne } : { etape: def.cle, dateISO: p.dateISO, ...(ancienne ? { ancienneDateISO: ancienne } : {}) },
  });
  return sauve;
}

export interface DaterEtapeGroupeeInput {
  coproCode: string;
  etape: string;
  dateISO: string;
  aujourdhuiISO: string;
}

/** Action groupée : la même étape, la même date, sur tous les CTQ ascenseur EN COURS de la copro. */
export async function daterEtapeGroupee(p: DaterEtapeGroupeeInput, auteur: AuteurContrats): Promise<{ cycles: Cycle[] }> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const def = definitionEtape("ctq_ascenseur", p.etape);
  refuserTerminale(def);
  const erreur = verifierDateEtape(p.dateISO, p.aujourdhuiISO);
  if (erreur) throw new Error(erreur);

  const cibles = await cyclesEnCours(repo, p.coproCode, "ctq_ascenseur");
  if (cibles.length === 0) throw new Error("Aucun contrôle d'ascenseur en cours sur cette copropriété : rien à dater.");

  const cycles: Cycle[] = [];
  for (const cycle of cibles) {
    const ancienne = cycle.etapes[def.cle] ?? null;
    const sauve: Cycle = { ...cycle, etapes: { ...cycle.etapes, [def.cle]: p.dateISO } };
    await repo.sauverCycle(sauve);
    cycles.push(sauve);
    await journaliser({
      coproCode: p.coproCode,
      sujet: "ctq_ascenseur",
      cycleId: cycle.id,
      type: "etape_datee",
      ...signature(auteur),
      details: { etape: def.cle, dateISO: p.dateISO, ...(ancienne ? { ancienneDateISO: ancienne } : {}), groupee: true },
    });
  }
  return { cycles };
}

// --- Démarrer un suivi -------------------------------------------------------------------

export interface DemarrerSuiviInput {
  coproCode: string;
  sujet: SujetSuivi;
  /** Un cycle d'amorçage existant : on le sort de l'état replié. */
  cycleId?: string;
  /** CTQ ascenseur sans cycle : l'appareil à suivre (obligatoire). */
  ascenseurId?: string;
  echeanceISO?: string | null;
}

/** « Démarrer le suivi » : sur un cycle d'amorçage, ou en créant le premier cycle d'un sujet. */
export async function demarrerSuivi(p: DemarrerSuiviInput, auteur: AuteurContrats): Promise<Cycle> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();

  let cycle: Cycle;
  if (p.cycleId) {
    const existant = await chargerCycle(repo, p.coproCode, p.sujet, p.cycleId);
    if (existant.statut !== "en_cours") throw new Error("Seul un cycle en cours se démarre.");
    cycle = demarrer(existant);
    await repo.sauverCycle(cycle);
  } else {
    let ascenseurId: string | undefined;
    let echeanceISO = jourOuNull(p.echeanceISO, "L'échéance");
    if (p.sujet === "ctq_ascenseur") {
      if (!p.ascenseurId) throw new Error("Choisis l'appareil : un contrôle d'ascenseur se suit appareil par appareil.");
      const appareil = await chargerAppareil(repo, p.coproCode, p.ascenseurId);
      ascenseurId = appareil.id;
      echeanceISO = echeanceISO ?? echeanceDepuisDernierCtq(appareil.dernierCtqISO);
    }
    const dejaEnCours = await cyclesEnCours(repo, p.coproCode, p.sujet, ascenseurId);
    if (dejaEnCours.length > 0) {
      throw new Error(
        ascenseurId
          ? "Un contrôle est déjà en cours pour cet appareil : c'est lui qu'il faut faire avancer."
          : `Un suivi « ${LIBELLE_SUJET[p.sujet]} » est déjà en cours sur cette copropriété : c'est lui qu'il faut faire avancer.`,
      );
    }
    cycle = await repo.creerCycle(cycleInitial({ sujet: p.sujet, coproCode: p.coproCode, echeanceISO, ...(ascenseurId ? { ascenseurId } : {}) }));
  }

  await journaliser({ coproCode: p.coproCode, sujet: p.sujet, cycleId: cycle.id, type: "suivi_demarre", ...signature(auteur), details: {} });
  return cycle;
}

// --- Définir l'échéance ------------------------------------------------------------------

export interface DefinirEcheanceInput {
  coproCode: string;
  sujet: SujetSuivi;
  cycleId: string;
  echeanceISO: string | null;
}

/**
 * Comble (ou corrige) l'échéance d'un cycle en cours, depuis « À compléter ». Pour l'assurance
 * et le gaz, la copro porte aussi cette échéance (fiche copro, ODJ du CS) : on la recopie.
 */
export async function definirEcheance(p: DefinirEcheanceInput, auteur: AuteurContrats): Promise<Cycle> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const cycle = await chargerCycle(repo, p.coproCode, p.sujet, p.cycleId);
  if (cycle.statut !== "en_cours") throw new Error("Seul un cycle en cours a une échéance à définir.");
  const echeanceISO = jourOuNull(p.echeanceISO, "L'échéance");

  const sauve: Cycle = { ...cycle, echeanceISO };
  await repo.sauverCycle(sauve);
  if (p.sujet === "assurance") await repo.setContratCourant(p.coproCode, { assurance: { echeanceISO } });
  if (p.sujet === "gaz") await repo.setContratCourant(p.coproCode, { gaz: { echeanceISO } });

  await journaliser({
    coproCode: p.coproCode,
    sujet: p.sujet,
    cycleId: cycle.id,
    type: "contrat_corrige",
    ...signature(auteur),
    details: { champ: "echeance", avant: cycle.echeanceISO, apres: echeanceISO },
  });
  return sauve;
}

// --- Clôturer un cycle -------------------------------------------------------------------

export interface CloturerCycleInput {
  coproCode: string;
  sujet: SujetSuivi;
  cycleId: string;
  dateTerminaleISO: string;
  aujourdhuiISO: string;
  /** Gaz : obligatoire (la durée de l'offre fait l'échéance). Assurance : facultative. */
  offreRetenueId?: string | null;
  /** Assurance : l'échéance du nouveau contrat, saisie à la main. */
  echeanceSaisieISO?: string;
  /** Assurance : numéro du nouveau contrat, s'il est connu. */
  numeroContrat?: string | null;
}

/**
 * Clôture atomique au sens métier (D3) : terminale datée, cycle clos, suivant créé ; ou
 * re-clôture (D4) : seule l'échéance du suivant existant bouge. Puis le report sur le contrat
 * courant (héritage de l'offre retenue) ou sur l'appareil (date du dernier CTQ).
 *
 * La re-clôture ne vaut que pour le DERNIER cycle clos, et seulement s'il a bien un suivant
 * en cours créé après lui ; un cycle clos sans suivant est une incohérence à signaler, pas à
 * réparer en silence par une seconde clôture.
 */
export async function cloturerCycle(p: CloturerCycleInput, auteur: AuteurContrats): Promise<{ clos: Cycle; suivant: Cycle | null }> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const cycle = await chargerCycle(repo, p.coproCode, p.sujet, p.cycleId);
  if (cycle.statut === "clos") await exigerDernierClos(repo, cycle);
  const suivantExistant = await suivantDe(repo, cycle);
  if (cycle.statut === "clos" && !suivantExistant) {
    throw new Error("Ce cycle clos n'a pas de cycle suivant en cours : le suivi est incohérent, signale-le plutôt que de le re-clôturer.");
  }

  let offreGaz: OffreGaz | null = null;
  let offreAssurance: OffreAssurance | null = null;
  if (p.offreRetenueId) {
    if (cycle.sujet === "gaz") {
      offreGaz = (await repo.listerOffresGaz([cycle.id])).find((o) => o.id === p.offreRetenueId) ?? null;
      if (!offreGaz) throw new Error("L'offre retenue est introuvable sur ce cycle.");
    } else if (cycle.sujet === "assurance") {
      offreAssurance = (await repo.listerOffresAssurance([cycle.id])).find((o) => o.id === p.offreRetenueId) ?? null;
      if (!offreAssurance) throw new Error("L'offre retenue est introuvable sur ce cycle.");
    }
  }

  const r = preparerCloture(cycle, {
    dateTerminaleISO: p.dateTerminaleISO,
    aujourdhuiISO: p.aujourdhuiISO,
    offreRetenueId: p.offreRetenueId ?? null,
    ...(offreGaz ? { dureeMois: offreGaz.dureeMois } : {}),
    ...(p.echeanceSaisieISO ? { echeanceSaisieISO: p.echeanceSaisieISO } : {}),
    suivantExistant,
  });
  if (!r.ok) throw new Error(r.erreur);

  const suivant = await repo.cloturer(r.cloture);

  // Le report : contrat courant (gaz, assurance, VMC) ou appareil (ascenseur).
  if (cycle.sujet === "gaz" && offreGaz) {
    await repo.setContratCourant(p.coproCode, heritageOffreGaz(offreGaz, p.dateTerminaleISO));
  } else if (cycle.sujet === "assurance" && p.echeanceSaisieISO) {
    await repo.setContratCourant(p.coproCode, heritageOffreAssurance(offreAssurance, p.echeanceSaisieISO, p.numeroContrat));
  } else if (r.patchContrat) {
    await repo.setContratCourant(p.coproCode, r.patchContrat);
  }
  if (cycle.sujet === "ctq_ascenseur" && cycle.ascenseurId && r.nouveauDernierCtqISO) {
    const appareil = await repo.getAscenseur(cycle.ascenseurId);
    if (appareil) await repo.sauverAscenseur({ ...appareil, dernierCtqISO: r.nouveauDernierCtqISO });
  }

  const nomOffre = offreGaz?.fournisseur ?? offreAssurance?.assureur ?? null;
  const echeanceSuivanteISO = r.cloture.suivant?.echeanceISO ?? r.cloture.suivantAjuste?.echeanceISO ?? suivant?.echeanceISO ?? null;
  await journaliser({
    coproCode: p.coproCode,
    sujet: p.sujet,
    cycleId: cycle.id,
    type: r.reCloture ? "cycle_recloture" : "cycle_clos",
    ...signature(auteur),
    details: { dateTerminaleISO: p.dateTerminaleISO, echeanceSuivanteISO, ...(nomOffre ? { offre: nomOffre } : {}) },
  });
  if (nomOffre) {
    await journaliser({
      coproCode: p.coproCode,
      sujet: p.sujet,
      cycleId: cycle.id,
      type: "offre_retenue",
      ...signature(auteur),
      details: { fournisseur: nomOffre, montant: offreGaz?.montant ?? offreAssurance?.prime ?? null },
    });
  }
  return { clos: r.cloture.clos, suivant };
}

// --- Corriger le contrat courant ---------------------------------------------------------

type GroupePatch = keyof PatchContratCourant;

const SUJET_PAR_GROUPE: Record<GroupePatch, SujetSuivi | null> = {
  assurance: "assurance",
  gaz: "gaz",
  vmc: "ctq_vmc",
  compteurs: null,
  immatriculation: null,
};

/** Noms lisibles des champs dans le journal (« Contrat courant : courtier corrigé de … »). */
const LIBELLE_CHAMP: Record<string, string> = {
  "assurance.compagnie": "compagnie d'assurance",
  "assurance.numeroContrat": "numéro de contrat d'assurance",
  "assurance.courtier": "courtier",
  "assurance.souscriptionISO": "date de souscription de l'assurance",
  "assurance.echeanceISO": "échéance de l'assurance",
  "assurance.prime": "prime d'assurance",
  "gaz.fournisseur": "fournisseur de gaz",
  "gaz.typePrix": "type de prix du gaz",
  "gaz.montant": "montant du contrat gaz",
  "gaz.echeanceISO": "échéance du contrat gaz",
  "vmc.societe": "société VMC",
  "vmc.reference": "référence VMC",
  "vmc.dernierCtqISO": "date du dernier contrôle VMC",
  "compteurs.ascenseurs": "nombre d'ascenseurs",
  "compteurs.chaudieres": "nombre de chaudières",
  "compteurs.vmcGaz": "nombre de VMC gaz",
  "immatriculation.numero": "numéro d'immatriculation",
  "immatriculation.nonApplicable": "immatriculation non applicable",
};

interface ChampModifie {
  groupe: GroupePatch;
  champ: string;
  avant: unknown;
  apres: unknown;
}

/** Les dates du contrat courant qui sont des FAITS passés : jamais dans le futur (une échéance, si). */
const CHAMPS_DATE_PASSEE = new Set(["assurance.souscriptionISO", "vmc.dernierCtqISO"]);

/**
 * Patch du contrat courant, journalisé champ par champ (avant / après lus sur la copro).
 * Règle spéciale (source `setInsuranceBroker`, D-DATA-24) : passer chez un courtier partenaire
 * (comparaison par nom normalisé : « AREAS » vaut « Areas ») archive le cycle assurance en
 * cours, sauf s'il a été démarré à la main (D19 : une volonté humaine ne s'archive pas toute
 * seule). `aujourdhuiISO` (jour de Paris par défaut) borne les dates de faits passés.
 */
export async function corrigerContrat(p: { coproCode: string; patch: PatchContratCourant; aujourdhuiISO?: string }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const aujourdhuiISO = p.aujourdhuiISO ?? jourParis();
  const avant = await repo.getContratCourant(p.coproCode);
  if (!avant) throw new Error("Copropriété introuvable dans le référentiel des contrats.");

  const modifies: ChampModifie[] = [];
  const patch: PatchContratCourant = {};
  for (const groupe of Object.keys(p.patch) as GroupePatch[]) {
    const valeurs = p.patch[groupe] as Record<string, unknown> | undefined;
    if (!valeurs) continue;
    const courant = avant[groupe] as Record<string, unknown>;
    const retenu: Record<string, unknown> = {};
    for (const [champ, apres] of Object.entries(valeurs)) {
      if (apres === undefined) continue;
      const nettoye = typeof apres === "string" ? apres.trim() || null : apres;
      const libelle = LIBELLE_CHAMP[`${groupe}.${champ}`] ?? champ;
      if (champ.endsWith("ISO") && nettoye !== null && !estJourISO(nettoye as string)) {
        throw new Error(`${libelle} illisible : attendu un jour au format AAAA-MM-JJ.`);
      }
      if (CHAMPS_DATE_PASSEE.has(`${groupe}.${champ}`) && nettoye !== null && (nettoye as string) > aujourdhuiISO) {
        throw new Error(`La ${libelle} ne peut pas être dans le futur.`);
      }
      if ((courant[champ] ?? null) === nettoye) continue;
      retenu[champ] = nettoye;
      modifies.push({ groupe, champ, avant: courant[champ] ?? null, apres: nettoye });
    }
    if (Object.keys(retenu).length) (patch as Record<string, unknown>)[groupe] = retenu;
  }
  if (modifies.length === 0) return;

  await repo.setContratCourant(p.coproCode, patch);
  for (const m of modifies) {
    await journaliser({
      coproCode: p.coproCode,
      sujet: SUJET_PAR_GROUPE[m.groupe],
      cycleId: null,
      type: "contrat_corrige",
      ...signature(auteur),
      details: { champ: LIBELLE_CHAMP[`${m.groupe}.${m.champ}`] ?? `${m.groupe}.${m.champ}`, avant: m.avant, apres: m.apres },
    });
  }

  const courtier = modifies.find((m) => m.groupe === "assurance" && m.champ === "courtier");
  if (courtier && estChezCourtierPartenaire(courtier.apres as string | null, await courtiersPartenaires())) {
    const enCours = await cyclesEnCours(repo, p.coproCode, "assurance");
    for (const cycle of enCours) {
      if (cycle.demarreManuellement === true) continue;
      await repo.sauverCycle({ ...cycle, statut: "archive" });
      await journaliser({
        coproCode: p.coproCode,
        sujet: "assurance",
        cycleId: cycle.id,
        type: "suivi_archive",
        ...signature(auteur),
        details: { raison: `courtier partenaire (${courtier.apres as string})` },
      });
    }
  }
}

// --- Appareils ---------------------------------------------------------------------------

export interface CreerAppareilInput {
  coproCode: string;
  identifiant?: string | null;
  dernierCtqISO?: string | null;
  notes?: string | null;
  /** Ouvre le cycle CTQ initial de l'appareil (défaut true). */
  ouvrirCycle?: boolean;
}

/** Crée un ascenseur et, par défaut, son premier cycle CTQ (échéance = dernier CTQ + 5 ans). */
export async function creerAppareil(p: CreerAppareilInput, auteur: AuteurContrats): Promise<Ascenseur> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const dernierCtqISO = jourOuNull(p.dernierCtqISO, "La date du dernier contrôle");
  const identifiant = p.identifiant?.trim() || null;
  const notes = p.notes?.trim() || null;

  const appareil = await repo.creerAscenseur({ coproCode: p.coproCode, identifiant, dernierCtqISO, notes });
  let cycleId: string | null = null;
  if (p.ouvrirCycle !== false) {
    const cycle = await repo.creerCycle(
      cycleInitial({ sujet: "ctq_ascenseur", coproCode: p.coproCode, ascenseurId: appareil.id, echeanceISO: echeanceDepuisDernierCtq(dernierCtqISO) }),
    );
    cycleId = cycle.id;
  }
  await journaliser({ coproCode: p.coproCode, sujet: "ctq_ascenseur", cycleId, type: "appareil_cree", ...signature(auteur), details: { identifiant } });
  return appareil;
}

export interface ModifierAppareilInput {
  coproCode: string;
  ascenseurId: string;
  identifiant?: string | null;
  dernierCtqISO?: string | null;
  notes?: string | null;
  /** Borne du dernier CTQ (un contrôle est un fait passé) ; jour de Paris par défaut. */
  aujourdhuiISO?: string;
}

const LIBELLE_CHAMP_APPAREIL: Record<"identifiant" | "dernierCtqISO" | "notes", string> = {
  identifiant: "identifiant",
  dernierCtqISO: "date du dernier contrôle",
  notes: "notes",
};

/**
 * Modifie un appareil. Changer le dernier CTQ recalcule l'échéance du cycle en cours s'il n'a
 * encore aucune étape datée ; sinon l'échéance est pilotée par le cycle, on n'y touche pas.
 */
export async function modifierAppareil(p: ModifierAppareilInput, auteur: AuteurContrats): Promise<Ascenseur> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const avant = await chargerAppareil(repo, p.coproCode, p.ascenseurId);

  const apres: Ascenseur = { ...avant };
  const modifies: { champ: keyof typeof LIBELLE_CHAMP_APPAREIL; avant: string | null; apres: string | null }[] = [];
  const poser = (champ: keyof typeof LIBELLE_CHAMP_APPAREIL, valeur: string | null) => {
    if ((avant[champ] ?? null) === valeur) return;
    apres[champ] = valeur;
    modifies.push({ champ, avant: avant[champ] ?? null, apres: valeur });
  };
  if (p.identifiant !== undefined) poser("identifiant", p.identifiant?.trim() || null);
  if (p.notes !== undefined) poser("notes", p.notes?.trim() || null);
  if (p.dernierCtqISO !== undefined) {
    const dernierCtqISO = jourOuNull(p.dernierCtqISO, "La date du dernier contrôle");
    if (dernierCtqISO && dernierCtqISO > (p.aujourdhuiISO ?? jourParis())) throw new Error("La date du dernier contrôle ne peut pas être dans le futur.");
    poser("dernierCtqISO", dernierCtqISO);
  }
  if (modifies.length === 0) return avant;

  await repo.sauverAscenseur(apres);

  if (modifies.some((m) => m.champ === "dernierCtqISO")) {
    const [enCours] = await cyclesEnCours(repo, p.coproCode, "ctq_ascenseur", avant.id);
    if (enCours && Object.keys(enCours.etapes).length === 0) {
      await repo.sauverCycle({ ...enCours, echeanceISO: echeanceDepuisDernierCtq(apres.dernierCtqISO) });
    }
  }

  for (const m of modifies) {
    await journaliser({
      coproCode: p.coproCode,
      sujet: "ctq_ascenseur",
      cycleId: null,
      type: "appareil_modifie",
      ...signature(auteur),
      details: { champ: LIBELLE_CHAMP_APPAREIL[m.champ], avant: m.avant, apres: m.apres, ascenseurId: avant.id },
    });
  }
  return apres;
}
