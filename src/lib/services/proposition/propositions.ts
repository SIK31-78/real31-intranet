// Services du module Propositions (ADR-039). Passent par le routeur (ADR-001). Tout le
// cabinet lit et ecrit ; la gestion des roles viendra plus tard.

import { getCoproRepository, getFacturationRepository, getPropositionRepository, getRegistreCoprosProvider } from "@/lib/adapters/router";
import type { RegistreCopro } from "@/lib/ports/proposition-repository";
import { analyserAdresse, immatriculationDansTexte, rapprocher, requeteRegistre, type CandidatRegistre } from "@/lib/domain/proposition/rapprochement";
import { coproContratDepuisProposition, cycleOffre, obstaclesOffre, texteMailOffre, type OptionsOffre } from "@/lib/domain/proposition/offre";
import { assemblerChampsContrat, PRESTATIONS_CONTRAT, type ChampsContrat, type PrestationContrat } from "@/lib/domain/contrat/champs-contrat";
import { motifRefusCycle } from "@/lib/domain/contrat/cycle-contrat";
import {
  calculerForfait,
  LIGNES_FORFAIT,
  type CaracteristiquesImmeuble,
  type Forfait,
  type GrilleForfait,
  type LigneForfait,
} from "@/lib/domain/proposition/forfait";
import {
  informationsManquantes,
  LIBELLE_STATUT,
  STATUTS_OUVERTS,
  type Contact,
  type Immeuble,
  type Origine,
  type Prix,
  type Proposition,
  type StatutProposition,
} from "@/lib/domain/proposition/proposition";

export interface PropositionResume extends Proposition {
  manquant: string[];
}

export async function listerPropositions(): Promise<PropositionResume[]> {
  const toutes = await getPropositionRepository().lister();
  return toutes.map((p) => ({ ...p, manquant: informationsManquantes(p, "contact") }));
}

export function getProposition(id: string): Promise<Proposition | null> {
  return getPropositionRepository().get(id);
}

/** Le registre : charge quand, combien de coproprietes, et s'il date (l'ANAH publie chaque trimestre). */
export async function etatRegistre(): Promise<{ chargeLeISO: string; nombre: number; perime: boolean } | null> {
  const e = await getRegistreCoprosProvider().etat();
  if (!e) return null;
  const limite = new Date();
  limite.setUTCMonth(limite.getUTCMonth() - 4);
  return { ...e, perime: e.chargeLeISO < limite.toISOString().slice(0, 10) };
}

export function rechercherRegistre(texte: string): Promise<RegistreCopro[]> {
  return getRegistreCoprosProvider().rechercher(texte, 8);
}

/** Ce que le registre apporte a l'immeuble d'une proposition (sans ecraser ce qui est saisi). */
export function immeubleDepuisRegistre(r: RegistreCopro, base: Immeuble = { adresse: "" }): Immeuble {
  return {
    ...base,
    adresse: base.adresse?.trim() || r.adresse,
    codePostal: base.codePostal ?? r.codePostal,
    commune: base.commune ?? r.commune,
    immatriculation: r.immatriculation,
    ...(base.lotsPrincipaux === undefined && r.lotsPrincipaux !== null ? { lotsPrincipaux: r.lotsPrincipaux } : {}),
    ...(base.lotsStationnement === undefined && r.lotsStationnement !== null ? { lotsStationnement: r.lotsStationnement } : {}),
    ...(base.periodeConstruction === undefined && r.periodeConstruction ? { periodeConstruction: r.periodeConstruction } : {}),
    ...(base.syndicActuel === undefined && r.syndicNom ? { syndicActuel: r.syndicNom } : {}),
    ...(base.finMandatActuelISO === undefined && r.finMandatISO ? { finMandatActuelISO: r.finMandatISO } : {}),
  };
}

export interface SaisieRapide {
  immeuble: Immeuble;
  contact: Contact;
  origine?: Origine;
  agence?: string;
  gestionnaire?: string;
  /** Immatriculation choisie dans le registre, pour pre-remplir. */
  immatriculation?: string;
  commentaires?: string;
  par: string;
}

/** La saisie rapide : ce qu'on sait, meme incomplet. La fiche dira ce qui manque. */
export async function creerProposition(s: SaisieRapide): Promise<Proposition> {
  let immeuble = s.immeuble;
  if (s.immatriculation) {
    const r = await getRegistreCoprosProvider().get(s.immatriculation);
    if (r) immeuble = immeubleDepuisRegistre(r, immeuble);
  }
  if (!immeuble.adresse?.trim()) throw new Error("L'adresse de l'immeuble est obligatoire.");
  // Sans moyen de rappeler, la fiche ne sert a rien (Sekou, 15/09/2026).
  if (!s.contact.telephone?.trim() && !s.contact.email?.trim()) throw new Error("Un téléphone ou un e-mail du contact est obligatoire.");
  const maintenant = new Date().toISOString();
  return getPropositionRepository().creer({
    statut: "en_cours",
    ...(s.agence ? { agence: s.agence } : {}),
    ...(s.gestionnaire ? { gestionnaire: s.gestionnaire } : {}),
    ...(s.origine ? { origine: s.origine } : {}),
    immeuble,
    contact: s.contact,
    prix: {},
    premierContactISO: maintenant.slice(0, 10),
    ...(s.commentaires?.trim() ? { commentaires: s.commentaires.trim() } : {}),
    journal: [{ quandISO: maintenant, par: s.par, texte: "Proposition créée" }],
    creeParNom: s.par,
  });
}

/** La grille du forfait pour une annee, lue dans intranet_tarifs. */
export async function grilleForfait(annee: number): Promise<GrilleForfait> {
  const lignes = await getFacturationRepository().listerBareme(annee);
  const parId = new Map(lignes.map((l) => [l.identifiantPrestation, l.montantTtc]));
  const grille: GrilleForfait = {};
  for (const [ligne, identifiant] of Object.entries(LIGNES_FORFAIT) as [LigneForfait, string][]) {
    const m = parId.get(identifiant);
    if (m !== undefined) grille[ligne] = m;
  }
  return grille;
}

export interface PrixCalcule {
  annee: number;
  grilleDisponible: boolean;
  forfait: Forfait;
}

/** Le prix de la grille pour cet immeuble, annee du jour. */
export async function calculerPrix(immeuble: Immeuble, annee = new Date().getUTCFullYear()): Promise<PrixCalcule> {
  const grille = await grilleForfait(annee);
  const c: CaracteristiquesImmeuble = {
    lotsPrincipaux: immeuble.lotsPrincipaux ?? 0,
    ...(immeuble.coproprietaires !== undefined ? { coproprietaires: immeuble.coproprietaires } : {}),
    ...(immeuble.chauffageCollectif !== undefined ? { chauffageCollectif: immeuble.chauffageCollectif } : {}),
    ...(immeuble.gardiens !== undefined ? { gardien: immeuble.gardiens > 0 } : {}),
    ...(immeuble.ascenseurs !== undefined ? { ascenseurs: immeuble.ascenseurs } : {}),
    ...(immeuble.portesGarage !== undefined ? { portesGarage: immeuble.portesGarage } : {}),
  };
  return { annee, grilleDisponible: grille.base !== undefined && grille.parLot !== undefined, forfait: calculerForfait(c, grille) };
}

export interface MiseAJourProposition {
  immeuble?: Immeuble;
  contact?: Contact;
  prix?: Prix;
  statut?: StatutProposition;
  agence?: string | null;
  gestionnaire?: string | null;
  origine?: Origine | null;
  remisePropositionISO?: string | null;
  agPrevueISO?: string | null;
  decisionISO?: string | null;
  commentaires?: string | null;
  /** Une ligne de journal libre. */
  note?: string;
}

export async function mettreAJourProposition(id: string, maj: MiseAJourProposition, par: string): Promise<Proposition> {
  const repo = getPropositionRepository();
  const p = await repo.get(id);
  if (!p) throw new Error("Proposition introuvable.");
  const journal = [...p.journal];
  const quand = new Date().toISOString();
  const n: Proposition = { ...p };
  if (maj.immeuble) n.immeuble = maj.immeuble;
  if (maj.contact) n.contact = maj.contact;
  if (maj.prix) {
    if (p.prix.honorairesTtc !== maj.prix.honorairesTtc && maj.prix.honorairesTtc !== undefined) {
      const geste = maj.prix.gesteCommercialTtc;
      const detail = [
        maj.prix.grilleTtc ? `grille ${maj.prix.grilleTtc.toLocaleString("fr-FR")} €` : null,
        geste ? (geste > 0 ? `geste commercial ${geste.toLocaleString("fr-FR")} €` : `majoration ${Math.abs(geste).toLocaleString("fr-FR")} €`) : null,
      ].filter(Boolean);
      journal.push({ quandISO: quand, par, texte: `Honoraires retenus : ${maj.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC${detail.length ? ` (${detail.join(", ")})` : ""}` });
    }
    n.prix = maj.prix;
  }
  if (maj.statut && maj.statut !== p.statut) {
    n.statut = maj.statut;
    journal.push({ quandISO: quand, par, texte: `Statut : ${LIBELLE_STATUT[maj.statut]}` });
    // Une decision se date ; une reouverture l'efface.
    if (!STATUTS_OUVERTS.has(maj.statut)) n.decisionISO = maj.decisionISO ?? quand.slice(0, 10);
    else delete n.decisionISO;
  }
  const champs = ["agence", "gestionnaire", "origine", "remisePropositionISO", "agPrevueISO", "decisionISO", "commentaires"] as const;
  const libre = n as unknown as Record<string, unknown>;
  for (const k of champs) {
    if (maj[k] === undefined) continue;
    if (maj[k] === null) delete libre[k];
    else libre[k] = maj[k];
  }
  if (maj.note?.trim()) journal.push({ quandISO: quand, par, texte: maj.note.trim() });
  n.journal = journal;
  await repo.sauver(n);
  return n;
}

// --- Cet immeuble : l'historique par immatriculation, et la copro App A si elle existe ---

export interface CoproConnue {
  code: string;
  nom: string;
  statut: "active" | "inactive";
  priseEnGestionISO?: string;
  mandatFinISO?: string;
}

export interface ContexteImmeuble {
  /** Les autres propositions pour le meme immeuble, les plus recentes d'abord. */
  autres: Proposition[];
  /** La copropriete du referentiel (geree, ou perdue) qui porte la meme immatriculation. */
  copro?: CoproConnue;
}

export async function contexteImmeuble(p: Proposition): Promise<ContexteImmeuble> {
  const imm = p.immeuble.immatriculation?.trim().toUpperCase();
  if (!imm) return { autres: [] };
  const [toutes, copros] = await Promise.all([
    getPropositionRepository().listerParImmatriculation(imm),
    getCoproRepository().listerToutes().catch(() => []),
  ]);
  const copro = copros.find((c) => c.immatriculation?.trim().toUpperCase() === imm);
  return {
    autres: toutes.filter((x) => x.id !== p.id),
    ...(copro
      ? {
          copro: {
            code: copro.code,
            nom: copro.nom,
            statut: copro.statut,
            ...(copro.priseEnGestion ? { priseEnGestionISO: copro.priseEnGestion } : {}),
            ...(copro.mandatSyndicFin ? { mandatFinISO: copro.mandatSyndicFin } : {}),
          },
        }
      : {}),
  };
}

// --- Rapprochement au registre (ADR-039, regle du 15/09/2026) ---

export interface SuggestionRapprochement {
  /** Le candidat certain (numero + voie + commune, unique), s'il y en a un. */
  sur?: RegistreCopro;
  candidats: RegistreCopro[];
}

function versCandidat(r: RegistreCopro): CandidatRegistre {
  return { immatriculation: r.immatriculation, adresse: r.adresse, adressesCompl: r.adressesCompl, commune: r.commune, codePostal: r.codePostal };
}

/** Ce que le registre propose pour l'adresse d'une proposition non rattachee. */
export async function suggererRapprochement(p: Proposition): Promise<SuggestionRapprochement> {
  // L'immatriculation est parfois ecrite dans l'adresse de l'Excel : c'est la reponse.
  const ecrite = immatriculationDansTexte(p.immeuble.adresse);
  if (ecrite) {
    const r = await getRegistreCoprosProvider().get(ecrite);
    if (r) return { sur: r, candidats: [r] };
  }
  const a = analyserAdresse(p.immeuble.adresse);
  const q = requeteRegistre(a);
  if (q.numeros.length === 0 || q.voie.length === 0) return { candidats: [] };
  const registre = await getRegistreCoprosProvider().candidats(q.numeros, q.voie);
  const parImm = new Map(registre.map((r) => [r.immatriculation, r]));
  const r = rapprocher(a, registre.map(versCandidat));
  return {
    ...(r.sur ? { sur: parImm.get(r.sur.immatriculation) } : {}),
    candidats: r.candidats.map((c) => parImm.get(c.immatriculation)).filter((x): x is RegistreCopro => Boolean(x)),
  };
}

export interface ARapprocher {
  proposition: Proposition;
  suggestion: SuggestionRapprochement;
}

/** Les propositions ouvertes sans immatriculation, avec ce que le registre propose. */
export async function propositionsARapprocher(): Promise<ARapprocher[]> {
  const ouvertes = await getPropositionRepository().lister({ statuts: [...STATUTS_OUVERTS] });
  const sans = ouvertes.filter((p) => !p.immeuble.immatriculation);
  const resultats: ARapprocher[] = [];
  for (const proposition of sans) resultats.push({ proposition, suggestion: await suggererRapprochement(proposition) });
  return resultats;
}

/** Rattache une proposition a un immeuble du registre : l'immatriculation devient sa cle. */
export async function rattacherProposition(id: string, immatriculation: string, par: string): Promise<Proposition> {
  const repo = getPropositionRepository();
  const p = await repo.get(id);
  if (!p) throw new Error("Proposition introuvable.");
  const r = await getRegistreCoprosProvider().get(immatriculation);
  if (!r) throw new Error("Cet immeuble n'est pas au registre.");
  const n: Proposition = {
    ...p,
    immeuble: immeubleDepuisRegistre(r, p.immeuble),
    journal: [...p.journal, { quandISO: new Date().toISOString(), par, texte: `Rattachée au registre national (${r.immatriculation}, ${r.adresse}, ${r.commune}).` }],
  };
  await repo.sauver(n);
  return n;
}

/** Detache une proposition du registre (mauvais rattachement). */
export async function detacherProposition(id: string, par: string): Promise<Proposition> {
  const repo = getPropositionRepository();
  const p = await repo.get(id);
  if (!p) throw new Error("Proposition introuvable.");
  const { immatriculation, ...immeuble } = p.immeuble;
  const n: Proposition = { ...p, immeuble, journal: [...p.journal, { quandISO: new Date().toISOString(), par, texte: `Détachée du registre national (${immatriculation ?? "?"}).` }] };
  await repo.sauver(n);
  return n;
}

// --- L'offre (brique 2) : le contrat prospect et le mail pre-redige ---

export interface Offre {
  proposition: Proposition;
  /** Ce qui empeche encore de faire l'offre ; vide quand tout est la. */
  obstacles: string[];
  /** Le contrat de syndic rempli au nom de l'immeuble (absent si obstacle ou bareme incomplet). */
  champs?: ChampsContrat;
  /** Ce qui a empeche de remplir le contrat, en clair. */
  erreurContrat?: string;
  mail: string;
}

/**
 * Prepare l'offre : le contrat prospect sur le gabarit 2026 (bareme de l'annee de l'AG,
 * les 21 prestations exigees, comme /contrat) et le mail du cabinet avec les montants.
 */
export async function preparerOffre(id: string, options: OptionsOffre, signataire: { nom: string }): Promise<Offre> {
  const p = await getPropositionRepository().get(id);
  if (!p) throw new Error("Proposition introuvable.");
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const cycle = cycleOffre(p, options, aujourdHui);
  const obstacles = obstaclesOffre(p);
  const mail = texteMailOffre(p, cycle, signataire);
  if (obstacles.length > 0) return { proposition: p, obstacles, mail };

  const refus = motifRefusCycle(cycle.debutISO, cycle.finISO);
  if (refus) return { proposition: p, obstacles, mail, erreurContrat: `Cycle impossible : ${refus}.` };
  const annee = Number(cycle.dateAgISO.slice(0, 4));
  const lignes = await getFacturationRepository().listerBareme(annee);
  const parId = new Map(lignes.map((l) => [l.identifiantPrestation, l]));
  const manquantes = PRESTATIONS_CONTRAT.filter((x) => !parId.has(x));
  if (manquantes.length > 0) {
    return { proposition: p, obstacles, mail, erreurContrat: `Barème ${annee} incomplet (${manquantes.join(", ")}) : ouvrir le barème avant d'éditer le contrat.` };
  }
  const tarifs = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
  for (const x of PRESTATIONS_CONTRAT) {
    const l = parId.get(x)!;
    tarifs[x] = { libelle: l.libelle, ttc: l.montantTtc };
  }
  return { proposition: p, obstacles, mail, champs: assemblerChampsContrat(coproContratDepuisProposition(p), cycle, tarifs) };
}

/** L'offre est partie : la proposition en garde la date, le cycle propose et une ligne de journal. */
export async function marquerOffreRemise(id: string, options: OptionsOffre, par: string): Promise<Proposition> {
  const repo = getPropositionRepository();
  const p = await repo.get(id);
  if (!p) throw new Error("Proposition introuvable.");
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const cycle = cycleOffre(p, options, aujourdHui);
  const n: Proposition = {
    ...p,
    remisePropositionISO: aujourdHui,
    ...(p.agPrevueISO ? {} : { agPrevueISO: cycle.dateAgISO }),
    journal: [
      ...p.journal,
      {
        quandISO: new Date().toISOString(),
        par,
        texte: `Offre remise : ${(p.prix.honorairesTtc ?? 0).toLocaleString("fr-FR")} € TTC par an, contrat du ${cycle.debutISO.split("-").reverse().join("/")} au ${cycle.finISO.split("-").reverse().join("/")}, AG du ${cycle.dateAgISO.split("-").reverse().join("/")}.`,
      },
    ],
  };
  await repo.sauver(n);
  return n;
}
