// La fiche immeuble (registre national des copropriétés) et ses bâtiments : lecture pour la
// section « Immeuble » de la fiche copro, file « bâtiments à compléter », et les gestes
// (modifier la fiche, créer / modifier / supprimer / pré-remplir les bâtiments). REA-333,
// décision 7 du 16/10/2026.
//
// Tout geste commence par exigerPerimetre (ADR-041) : on n'écrit que sur son portefeuille.
// Les cascades du registre s'appliquent côté serveur (appliquerCascades), le formulaire ne
// fait que les anticiper. Chaque geste laisse une entrée `immeuble_modifie` au journal.

import { getContratsCoproRepository } from "@/lib/adapters/router";
import {
  appliquerCascades,
  batimentsAPrefiller,
  champsManquantsImmeuble,
  erreurBatiment,
  erreurFicheImmeuble,
  LIBELLE_CHAMP_IMMEUBLE,
  type Batiment,
  type FicheImmeuble,
  type PatchFicheImmeuble,
} from "@/lib/domain/contrats-copro";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { coprosEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import { journaliser } from "./journal";
import type { AuteurContrats } from "./types";

export function ficheImmeubleVide(coproCode: string): FicheImmeuble {
  return {
    coproCode,
    surfaceM2: null,
    anneeConstruction: null,
    periodeConstruction: null,
    nombreBatiments: null,
    chauffageType: null,
    chauffageEnergie: null,
    chauffageSysteme: null,
    ecsType: null,
    ecsSysteme: null,
    ecsMemeQueChauffage: null,
    ventilationType: null,
    ventilationSysteme: null,
    bornesRechargeVE: null,
    locauxVelos: null,
    dpeCollectifRealise: null,
    diagnosticStructureRealise: null,
    pptInscritAG: null,
    pptVote: null,
    pptAdoptionISO: null,
    primeAssuranceActuelle: null,
    notes: null,
    batiments: [],
  };
}

// --- Lecture -----------------------------------------------------------------------------

/** La fiche immeuble d'une copro ; une fiche vide (code posé, aucun bâtiment) s'il n'y en a pas. */
export async function ficheImmeubleDe(coproCode: string): Promise<FicheImmeuble> {
  const fiche = await getContratsCoproRepository().getFicheImmeuble(coproCode);
  return fiche ?? ficheImmeubleVide(coproCode);
}

export interface ImmeubleACompleter {
  coproCode: string;
  coproNom: string;
  gestionnaire?: string;
  /** Les champs du registre encore vides, libellés en français. */
  manquants: string[];
}

/**
 * Les copros actives du cabinet dont la fiche immeuble est incomplète, triées par nom.
 * `coproCodes` restreint à un portefeuille ; absent = tout le cabinet (périmètre de lecture).
 */
export async function immeublesACompleter(p: { coproCodes?: readonly string[] } = {}): Promise<ImmeubleACompleter[]> {
  const cibles = p.coproCodes ? new Set(p.coproCodes) : null;
  const copros = (await coprosEnLecture()).filter((c) => c.statut === "active" && (!cibles || cibles.has(c.code)));
  if (copros.length === 0) return [];
  const fiches = await getContratsCoproRepository().listerFichesImmeuble(copros.map((c) => c.code));
  return copros
    .map((c) => ({
      coproCode: c.code,
      coproNom: c.nom,
      gestionnaire: c.equipe.find((m) => m.role === "gestionnaire")?.nomComplet,
      manquants: champsManquantsImmeuble(fiches.get(c.code) ?? null),
    }))
    .filter((i) => i.manquants.length > 0)
    .sort((a, b) => a.coproNom.localeCompare(b.coproNom, "fr"));
}

// --- Gestes sur la fiche -----------------------------------------------------------------

function signature(auteur: AuteurContrats) {
  return { parUserId: auteur.id, parNom: auteur.nom };
}

function nettoyerTexte(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Applique un patch à la fiche immeuble : validation (année entre 1600 et `anneeCourante`,
 * surface positive, bâtiments de 0 à 50), cascades du registre, puis journal des champs
 * réellement changés. Un patch sans effet n'écrit rien.
 */
export async function modifierImmeuble(p: { coproCode: string; patch: PatchFicheImmeuble; anneeCourante: number }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const actuelle = (await repo.getFicheImmeuble(p.coproCode)) ?? ficheImmeubleVide(p.coproCode);

  const propre: PatchFicheImmeuble = { ...p.patch, notes: nettoyerTexte(p.patch.notes) };
  if (!("notes" in p.patch)) delete propre.notes;
  // La prime est un montant : un nombre fini, positif ou nul (le domaine refuse le négatif,
  // on refuse aussi NaN et l'infini qu'une saisie « 1 2,3 » peut produire côté client).
  if (propre.primeAssuranceActuelle != null && !(Number.isFinite(propre.primeAssuranceActuelle) && propre.primeAssuranceActuelle >= 0)) {
    throw new Error("La prime d'assurance doit être un montant positif ou nul.");
  }
  const erreur = erreurFicheImmeuble(propre, p.anneeCourante);
  if (erreur) throw new Error(erreur);

  const patch = appliquerCascades(propre, actuelle);
  const champs = (Object.keys(patch) as (keyof PatchFicheImmeuble)[]).filter((cle) => patch[cle] !== undefined && patch[cle] !== actuelle[cle]);
  if (champs.length === 0) return;

  const aEcrire = Object.fromEntries(champs.map((cle) => [cle, patch[cle]])) as PatchFicheImmeuble;
  await repo.sauverFicheImmeuble(p.coproCode, aEcrire);
  await journaliser({
    coproCode: p.coproCode,
    sujet: null,
    cycleId: null,
    type: "immeuble_modifie",
    ...signature(auteur),
    details: { champs: champs.map((c) => LIBELLE_CHAMP_IMMEUBLE[c]) },
  });
}

// --- Gestes sur les bâtiments ------------------------------------------------------------

export interface SaisieBatiment {
  nom: string;
  anneeConstruction?: number | null;
  nombreEtages?: number | null;
  nombreAscenseurs?: number | null;
  etiquetteEnergie?: string | null;
}

async function journalBatiment(coproCode: string, auteur: AuteurContrats, phrase: string): Promise<void> {
  await journaliser({ coproCode, sujet: null, cycleId: null, type: "immeuble_modifie", ...signature(auteur), details: { champs: [phrase] } });
}

export async function creerBatiment(p: { coproCode: string; anneeCourante: number } & SaisieBatiment, auteur: AuteurContrats): Promise<Batiment> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const nouveau: Omit<Batiment, "id"> = {
    coproCode: p.coproCode,
    nom: p.nom.trim(),
    anneeConstruction: p.anneeConstruction ?? null,
    nombreEtages: p.nombreEtages ?? null,
    nombreAscenseurs: p.nombreAscenseurs ?? null,
    etiquetteEnergie: p.etiquetteEnergie ?? null,
  };
  const erreur = erreurBatiment(nouveau, p.anneeCourante);
  if (erreur) throw new Error(erreur);
  const cree = await getContratsCoproRepository().creerBatiment(nouveau);
  await journalBatiment(p.coproCode, auteur, `bâtiment « ${cree.nom} » ajouté`);
  return cree;
}

const LIBELLE_CHAMP_BATIMENT: Record<keyof Omit<Batiment, "id" | "coproCode">, string> = {
  nom: "nom",
  anneeConstruction: "année",
  nombreEtages: "étages",
  nombreAscenseurs: "ascenseurs",
  etiquetteEnergie: "étiquette énergie",
};

export async function modifierBatiment(p: { coproCode: string; batimentId: string; anneeCourante: number } & Partial<SaisieBatiment>, auteur: AuteurContrats): Promise<Batiment> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const fiche = await repo.getFicheImmeuble(p.coproCode);
  const existant = fiche?.batiments.find((b) => b.id === p.batimentId);
  if (!existant) throw new Error("Bâtiment introuvable sur cette copropriété.");

  const modifie: Batiment = {
    ...existant,
    nom: p.nom === undefined ? existant.nom : p.nom.trim(),
    anneeConstruction: p.anneeConstruction === undefined ? existant.anneeConstruction : p.anneeConstruction,
    nombreEtages: p.nombreEtages === undefined ? existant.nombreEtages : p.nombreEtages,
    nombreAscenseurs: p.nombreAscenseurs === undefined ? existant.nombreAscenseurs : p.nombreAscenseurs,
    etiquetteEnergie: p.etiquetteEnergie === undefined ? existant.etiquetteEnergie : p.etiquetteEnergie,
  };
  const erreur = erreurBatiment(modifie, p.anneeCourante);
  if (erreur) throw new Error(erreur);

  const changes = (Object.keys(LIBELLE_CHAMP_BATIMENT) as (keyof typeof LIBELLE_CHAMP_BATIMENT)[]).filter((c) => modifie[c] !== existant[c]);
  if (changes.length === 0) return existant;
  await repo.sauverBatiment(modifie);
  await journalBatiment(p.coproCode, auteur, `bâtiment « ${existant.nom} » : ${changes.map((c) => LIBELLE_CHAMP_BATIMENT[c]).join(", ")}`);
  return modifie;
}

export async function supprimerBatiment(p: { coproCode: string; batimentId: string }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const fiche = await repo.getFicheImmeuble(p.coproCode);
  const existant = fiche?.batiments.find((b) => b.id === p.batimentId);
  if (!existant) throw new Error("Bâtiment introuvable sur cette copropriété.");
  await repo.supprimerBatiment(p.batimentId);
  await journalBatiment(p.coproCode, auteur, `bâtiment « ${existant.nom} » supprimé`);
}

/**
 * Crée les bâtiments qui manquent pour atteindre le nombre annoncé sur la fiche, nommés
 * « Bâtiment A, B, C… » par position, l'année reprise de la fiche et les ascenseurs du
 * compteur d'équipement répartis. Les bâtiments déjà saisis ne bougent pas. Renvoie les créés.
 */
export async function prefillerBatiments(p: { coproCode: string }, auteur: AuteurContrats): Promise<Batiment[]> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const fiche = await repo.getFicheImmeuble(p.coproCode);
  if (!fiche || fiche.nombreBatiments === null) throw new Error("Renseigne d'abord le nombre de bâtiments sur la fiche immeuble.");
  if (fiche.batiments.length >= fiche.nombreBatiments) throw new Error("Tous les bâtiments annoncés sont déjà saisis.");

  const contrat = await repo.getContratCourant(p.coproCode);
  const nouveaux = batimentsAPrefiller({
    coproCode: p.coproCode,
    nombreBatiments: fiche.nombreBatiments,
    existants: fiche.batiments.length,
    anneeConstruction: fiche.anneeConstruction,
    totalAscenseurs: contrat?.compteurs.ascenseurs ?? null,
  });
  const crees: Batiment[] = [];
  for (const b of nouveaux) crees.push(await repo.creerBatiment(b));
  await journalBatiment(p.coproCode, auteur, `${crees.length} bâtiment${crees.length > 1 ? "s" : ""} pré-rempli${crees.length > 1 ? "s" : ""} (${crees.map((b) => b.nom.replace(/^Bâtiment /, "")).join(", ")})`);
  return crees;
}
