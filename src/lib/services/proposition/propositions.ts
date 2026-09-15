// Services du module Propositions (ADR-039). Passent par le routeur (ADR-001). Tout le
// cabinet lit et ecrit ; la gestion des roles viendra plus tard.

import { getFacturationRepository, getPropositionRepository, getRegistreCoprosProvider } from "@/lib/adapters/router";
import type { RegistreCopro } from "@/lib/ports/proposition-repository";
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
  return toutes.map((p) => ({ ...p, manquant: informationsManquantes(p) }));
}

export function getProposition(id: string): Promise<Proposition | null> {
  return getPropositionRepository().get(id);
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
  if (!immeuble.adresse?.trim()) throw new Error("Proposition : l'adresse de l'immeuble est obligatoire.");
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
      journal.push({ quandISO: quand, par, texte: `Honoraires retenus : ${maj.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC${maj.prix.grilleTtc ? ` (grille ${maj.prix.grilleTtc.toLocaleString("fr-FR")} €)` : ""}` });
    }
    n.prix = maj.prix;
  }
  if (maj.statut && maj.statut !== p.statut) {
    n.statut = maj.statut;
    journal.push({ quandISO: quand, par, texte: `Statut : ${maj.statut}` });
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
