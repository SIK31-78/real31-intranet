// Offres (assurance, gaz) et devis CTQ du module « Contrats & contrôles » (REA-333) : saisie,
// retrait, devis retenu. Règles des directeurs : une offre retenue à la validation ne se retire
// pas (D13, `peutRetirerOffre`) ; un devis CTQ est porté par la COPRO, un seul retenu par sujet
// (D35 à D37) ; les suppressions sont logiques (décision du 16/10), le journal garde la trace.
//
// Même ordre que suivi.ts : exigerPerimetre -> lecture -> verdict -> écriture -> journal.

import { getContratsCoproRepository } from "@/lib/adapters/router";
import {
  estJourISO,
  LIBELLE_SUJET,
  peutRetirerOffre,
  type Cycle,
  type DevisCtq,
  type OffreAssurance,
  type OffreGaz,
  type SujetCtq,
  type TypePrixGaz,
} from "@/lib/domain/contrats-copro";
import type { ContratsCoproRepository } from "@/lib/ports/contrats-copro-repository";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { journaliser } from "./journal";
import type { AuteurContrats } from "./types";

export const DUREE_GAZ_MAX_MOIS = 120;

// --- Outils ------------------------------------------------------------------------------

function signature(auteur: AuteurContrats): { parUserId: string; parNom: string } {
  return { parUserId: auteur.id, parNom: auteur.nom };
}

function texteObligatoire(valeur: string | null | undefined, champ: string): string {
  const t = valeur?.trim() ?? "";
  if (!t) throw new Error(`${champ} est obligatoire.`);
  return t;
}

function montantPositif(valeur: number, champ: string): number {
  if (!Number.isFinite(valeur) || valeur <= 0) throw new Error(`${champ} doit être un montant supérieur à zéro.`);
  return valeur;
}

function montantPositifOuNul(valeur: number, champ: string): number {
  if (!Number.isFinite(valeur) || valeur < 0) throw new Error(`${champ} doit être un montant positif ou nul.`);
  return valeur;
}

function jourOuNull(valeur: string | null | undefined, champ: string): string | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (!estJourISO(valeur)) throw new Error(`${champ} illisible : attendu un jour au format AAAA-MM-JJ.`);
  return valeur;
}

async function chargerCycle(repo: ContratsCoproRepository, coproCode: string, sujet: "assurance" | "gaz", cycleId: string): Promise<Cycle> {
  const cycle = await repo.getCycle(sujet, cycleId);
  if (!cycle) throw new Error("Ce cycle de suivi est introuvable : la page a peut-être changé, recharge-la.");
  if (cycle.coproCode !== coproCode) throw new Error("Ce cycle de suivi n'appartient pas à cette copropriété.");
  if (cycle.statut === "archive") throw new Error("Ce suivi est archivé : il ne reçoit plus d'offre.");
  return cycle;
}

// --- Offres d'assurance ------------------------------------------------------------------

export interface AjouterOffreAssuranceInput {
  coproCode: string;
  cycleId: string;
  assureur: string;
  prime: number;
  franchise: number;
  garanties?: string | null;
  recueLeISO?: string | null;
}

export async function ajouterOffreAssurance(p: AjouterOffreAssuranceInput, auteur: AuteurContrats): Promise<OffreAssurance> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const cycle = await chargerCycle(repo, p.coproCode, "assurance", p.cycleId);
  const offre = await repo.creerOffreAssurance({
    cycleId: cycle.id,
    assureur: texteObligatoire(p.assureur, "L'assureur"),
    prime: montantPositif(p.prime, "La prime"),
    // Une franchise nulle est une vraie offre (« sans franchise ») : zéro est permis.
    franchise: montantPositifOuNul(p.franchise, "La franchise"),
    garanties: p.garanties?.trim() || null,
    recueLeISO: jourOuNull(p.recueLeISO, "La date de réception"),
  });
  await journaliser({
    coproCode: p.coproCode,
    sujet: "assurance",
    cycleId: cycle.id,
    type: "offre_creee",
    ...signature(auteur),
    details: { fournisseur: offre.assureur, montant: offre.prime },
  });
  return offre;
}

export async function retirerOffreAssurance(p: { coproCode: string; cycleId: string; offreId: string }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const cycle = await chargerCycle(repo, p.coproCode, "assurance", p.cycleId);
  const refus = peutRetirerOffre(cycle, p.offreId);
  if (refus) throw new Error(refus);
  const offre = (await repo.listerOffresAssurance([cycle.id])).find((o) => o.id === p.offreId);
  if (!offre) throw new Error("Cette offre est introuvable sur ce cycle.");
  await repo.supprimerOffreAssurance(offre.id, auteur.id);
  await journaliser({
    coproCode: p.coproCode,
    sujet: "assurance",
    cycleId: cycle.id,
    type: "offre_retiree",
    ...signature(auteur),
    details: { fournisseur: offre.assureur, montant: offre.prime },
  });
}

// --- Offres de gaz -----------------------------------------------------------------------

export interface AjouterOffreGazInput {
  coproCode: string;
  cycleId: string;
  fournisseur: string;
  typePrix: TypePrixGaz;
  montant: number;
  dureeMois: number;
  recueLeISO?: string | null;
}

export async function ajouterOffreGaz(p: AjouterOffreGazInput, auteur: AuteurContrats): Promise<OffreGaz> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const cycle = await chargerCycle(repo, p.coproCode, "gaz", p.cycleId);
  if (p.typePrix !== "fixe" && p.typePrix !== "variable") throw new Error("Le type de prix est « fixe » ou « variable ».");
  if (!Number.isInteger(p.dureeMois) || p.dureeMois < 1 || p.dureeMois > DUREE_GAZ_MAX_MOIS) {
    throw new Error(`La durée du contrat se compte en mois, entre 1 et ${DUREE_GAZ_MAX_MOIS}.`);
  }
  const offre = await repo.creerOffreGaz({
    cycleId: cycle.id,
    fournisseur: texteObligatoire(p.fournisseur, "Le fournisseur"),
    typePrix: p.typePrix,
    montant: montantPositif(p.montant, "Le montant"),
    dureeMois: p.dureeMois,
    recueLeISO: jourOuNull(p.recueLeISO, "La date de réception"),
  });
  await journaliser({
    coproCode: p.coproCode,
    sujet: "gaz",
    cycleId: cycle.id,
    type: "offre_creee",
    ...signature(auteur),
    details: { fournisseur: offre.fournisseur, montant: offre.montant },
  });
  return offre;
}

export async function retirerOffreGaz(p: { coproCode: string; cycleId: string; offreId: string }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const cycle = await chargerCycle(repo, p.coproCode, "gaz", p.cycleId);
  const refus = peutRetirerOffre(cycle, p.offreId);
  if (refus) throw new Error(refus);
  const offre = (await repo.listerOffresGaz([cycle.id])).find((o) => o.id === p.offreId);
  if (!offre) throw new Error("Cette offre est introuvable sur ce cycle.");
  await repo.supprimerOffreGaz(offre.id, auteur.id);
  await journaliser({
    coproCode: p.coproCode,
    sujet: "gaz",
    cycleId: cycle.id,
    type: "offre_retiree",
    ...signature(auteur),
    details: { fournisseur: offre.fournisseur, montant: offre.montant },
  });
}

// --- Devis CTQ (portés par la copro) -----------------------------------------------------

export interface AjouterDevisInput {
  coproCode: string;
  sujet: SujetCtq;
  prestataire: string;
  montant: number;
  recueLeISO?: string | null;
}

export async function ajouterDevis(p: AjouterDevisInput, auteur: AuteurContrats): Promise<DevisCtq> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  if (p.sujet !== "ctq_ascenseur" && p.sujet !== "ctq_vmc") throw new Error("Un devis se rattache à un contrôle (ascenseur ou VMC).");
  const devis = await repo.creerDevisCtq({
    coproCode: p.coproCode,
    sujet: p.sujet,
    prestataire: texteObligatoire(p.prestataire, "Le prestataire"),
    montant: montantPositif(p.montant, "Le montant"),
    recueLeISO: jourOuNull(p.recueLeISO, "La date de réception"),
  });
  await journaliser({
    coproCode: p.coproCode,
    sujet: p.sujet,
    cycleId: null,
    type: "devis_cree",
    ...signature(auteur),
    details: { prestataire: devis.prestataire, montant: devis.montant },
  });
  return devis;
}

async function devisDeLaCopro(repo: ContratsCoproRepository, coproCode: string, devisId: string): Promise<DevisCtq> {
  const devis = (await repo.listerDevisCtq([coproCode])).find((d) => d.id === devisId);
  if (!devis) throw new Error("Ce devis est introuvable sur cette copropriété.");
  return devis;
}

export async function retirerDevis(p: { coproCode: string; devisId: string }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  const devis = await devisDeLaCopro(repo, p.coproCode, p.devisId);
  const contrat = await repo.getContratCourant(p.coproCode);
  if (contrat?.devisRetenu[devis.sujet] === devis.id) {
    throw new Error("Ce devis est celui retenu : retire d'abord sa sélection (ou retiens-en un autre) avant de le supprimer.");
  }
  await repo.supprimerDevisCtq(devis.id, auteur.id);
  await journaliser({
    coproCode: p.coproCode,
    sujet: devis.sujet,
    cycleId: null,
    type: "devis_retire",
    ...signature(auteur),
    details: { prestataire: devis.prestataire, montant: devis.montant },
  });
}

/** Retient un devis pour un sujet CTQ de la copro ; `devisId: null` lève la sélection. */
export async function retenirDevis(p: { coproCode: string; sujet: SujetCtq; devisId: string | null }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  if (p.devisId === null) {
    const contrat = await repo.getContratCourant(p.coproCode);
    const ancienId = contrat?.devisRetenu[p.sujet] ?? null;
    if (!ancienId) return;
    const ancien = (await repo.listerDevisCtq([p.coproCode])).find((d) => d.id === ancienId);
    await repo.setDevisRetenu(p.coproCode, p.sujet, null);
    await journaliser({
      coproCode: p.coproCode,
      sujet: p.sujet,
      cycleId: null,
      type: "contrat_corrige",
      ...signature(auteur),
      details: { champ: `devis retenu (${LIBELLE_SUJET[p.sujet]})`, avant: ancien?.prestataire ?? ancienId, apres: null },
    });
    return;
  }
  const devis = await devisDeLaCopro(repo, p.coproCode, p.devisId);
  if (devis.sujet !== p.sujet) throw new Error(`Ce devis concerne « ${LIBELLE_SUJET[devis.sujet]} », pas « ${LIBELLE_SUJET[p.sujet]} ».`);
  await repo.setDevisRetenu(p.coproCode, p.sujet, devis.id);
  await journaliser({
    coproCode: p.coproCode,
    sujet: p.sujet,
    cycleId: null,
    type: "devis_retenu",
    ...signature(auteur),
    details: { prestataire: devis.prestataire, montant: devis.montant },
  });
}
