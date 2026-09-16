"use server";

// Server Actions du module Propositions (ADR-039). Ouvertes a tout collaborateur
// connecte : la saisie rapide est faite pour celui qui decroche le telephone.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { MESSAGE_RESERVE_DIRECTION, peutCompleterProposition, peutDeciderProposition, peutElire, peutFaireOffre, profilDe } from "@/lib/auth/roles";
import { STATUTS_OUVERTS } from "@/lib/domain/proposition/proposition";
import { ORIGINES, STATUTS_PROPOSITION } from "@/lib/domain/proposition/proposition";
import {
  calculerPrix,
  creerProposition,
  detacherProposition,
  getProposition,
  marquerOffreRemise,
  mettreAJourProposition,
  rattacherProposition,
  rechercherRegistre,
  type PrixCalcule,
} from "@/lib/services/proposition/propositions";
import { elireProposition } from "@/lib/services/proposition/election";
import type { RegistreCopro } from "@/lib/ports/proposition-repository";


import { type Res, echecDepuis } from "@/lib/actions/resultat";
const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zNb = z.number().min(0).max(100000);
const zTexte = z.string().trim().max(300);

const zImmeuble = z.object({
  adresse: zTexte,
  codePostal: zTexte.optional(),
  commune: zTexte.optional(),
  immatriculation: zTexte.optional(),
  lotsPrincipaux: zNb.optional(),
  lotsStationnement: zNb.optional(),
  coproprietaires: zNb.optional(),
  cagesEscalier: zNb.optional(),
  ascenseurs: zNb.optional(),
  portesGarage: zNb.optional(),
  chauffageCollectif: z.boolean().optional(),
  menage: zTexte.optional(),
  employesImmeuble: zNb.optional(),
  gardiens: zNb.optional(),
  visitesPrevues: zNb.optional(),
  csPrevus: zNb.optional(),
  periodeConstruction: zTexte.optional(),
  assurance: zTexte.optional(),
  assuranceDateISO: zJour.optional(),
  syndicActuel: zTexte.optional(),
  finMandatActuelISO: zJour.optional(),
  prochaineAgISO: zJour.optional(),
  clotureComptable: zTexte.optional(),
  litiges: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const zContact = z.object({
  nom: zTexte.optional(),
  role: zTexte.optional(),
  telephone: zTexte.optional(),
  email: zTexte.optional(),
});
const zPrix = z.object({
  honorairesTtc: zNb.optional(),
  gesteCommercialTtc: z.number().min(-100000).max(100000).optional(),
  timbresTtc: zNb.optional(),
  grilleTtc: zNb.optional(),
  grilleTimbresTtc: zNb.optional(),
  anneeGrille: z.number().int().optional(),
  fraisPostauxReels: z.boolean().optional(),
});

/** Retire les chaines vides : un champ efface redevient absent. */
function epurer<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null)) as T;
}

export async function rechercherRegistreAction(texte: string): Promise<Res<RegistreCopro[]>> {
  if (!(await getGestionnaireCourant())) return { ok: false, erreur: "Session expirée." };
  if (typeof texte !== "string" || texte.trim().length < 3) return { ok: true, donnees: [] };
  try {
    return { ok: true, donnees: await rechercherRegistre(texte.slice(0, 120)) };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

const zSaisie = z.object({
  immeuble: zImmeuble,
  contact: zContact,
  origine: z.enum(ORIGINES).optional(),
  agence: zTexte.optional(),
  immatriculation: zTexte.optional(),
  commentaires: z.string().trim().max(2000).optional(),
});

export async function creerPropositionAction(input: unknown): Promise<Res<{ id: string }>> {
  const p = zSaisie.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    const cree = await creerProposition({
      immeuble: epurer(p.data.immeuble),
      contact: epurer(p.data.contact),
      ...(p.data.origine ? { origine: p.data.origine } : {}),
      ...(p.data.agence ? { agence: p.data.agence } : {}),
      ...(p.data.immatriculation ? { immatriculation: p.data.immatriculation } : {}),
      ...(p.data.commentaires ? { commentaires: p.data.commentaires } : {}),
      gestionnaire: g.nomComplet,
      par: g.nomComplet,
    });
    revalidatePath("/propositions");
    return { ok: true, donnees: { id: cree.id } };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

const zMaj = z.object({
  id: z.string().min(1),
  immeuble: zImmeuble.optional(),
  contact: zContact.optional(),
  prix: zPrix.optional(),
  statut: z.enum(STATUTS_PROPOSITION).optional(),
  agence: zTexte.nullable().optional(),
  gestionnaire: zTexte.nullable().optional(),
  origine: z.enum(ORIGINES).nullable().optional(),
  remisePropositionISO: zJour.nullable().optional(),
  agPrevueISO: zJour.nullable().optional(),
  decisionISO: zJour.nullable().optional(),
  commentaires: z.string().trim().max(2000).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function mettreAJourPropositionAction(input: unknown): Promise<Res> {
  const p = zMaj.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  const profil = profilDe(g);
  const existante = await getProposition(p.data.id);
  if (!existante) return { ok: false, erreur: "Proposition introuvable." };
  const agence = existante.agence;
  // Le prix : la direction de l'agence. Clore (elue, refusee) ou dater la remise / l'AG /
  // la decision : les memes - sinon un gestionnaire passait « elue » sans creer la copro
  // (audit du 16/09/2026).
  if (p.data.prix && !peutFaireOffre(profil, agence)) return { ok: false, erreur: `Le prix : ${MESSAGE_RESERVE_DIRECTION}` };
  const decide =
    (p.data.statut !== undefined && p.data.statut !== existante.statut && (!STATUTS_OUVERTS.has(p.data.statut) || !STATUTS_OUVERTS.has(existante.statut))) ||
    p.data.remisePropositionISO !== undefined ||
    p.data.agPrevueISO !== undefined ||
    p.data.decisionISO !== undefined;
  if (decide && !peutDeciderProposition(profil, agence)) return { ok: false, erreur: `Clore ou dater une proposition : ${MESSAGE_RESERVE_DIRECTION}` };
  if (!p.data.prix && !peutCompleterProposition(profil) && existante.creeParNom !== g.nomComplet) {
    return { ok: false, erreur: "Vous ne pouvez modifier que les contacts que vous avez créés." };
  }
  try {
    const { id, ...maj } = p.data;
    await mettreAJourProposition(
      id,
      {
        ...maj,
        ...(maj.immeuble ? { immeuble: epurer(maj.immeuble) } : {}),
        ...(maj.contact ? { contact: epurer(maj.contact) } : {}),
        ...(maj.prix ? { prix: epurer(maj.prix) } : {}),
      },
      g.nomComplet,
    );
    revalidatePath("/propositions");
    revalidatePath(`/propositions/${id}`);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

export async function calculerPrixAction(immeuble: unknown): Promise<Res<PrixCalcule>> {
  if (!(await getGestionnaireCourant())) return { ok: false, erreur: "Session expirée." };
  const p = zImmeuble.safeParse(immeuble);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  try {
    return { ok: true, donnees: await calculerPrix(epurer(p.data)) };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

const zRattacher = z.object({ id: z.string().min(1), immatriculation: z.string().trim().regex(/^[A-Z]{2}\d{7}$/i) });

export async function rattacherPropositionAction(input: unknown): Promise<Res> {
  const p = zRattacher.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Immatriculation invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutCompleterProposition(profilDe(g))) return { ok: false, erreur: "Réservé à l'équipe syndic." };
  try {
    await rattacherProposition(p.data.id, p.data.immatriculation.toUpperCase(), g.nomComplet);
    revalidatePath("/propositions");
    revalidatePath(`/propositions/${p.data.id}`);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

export async function detacherPropositionAction(id: unknown): Promise<Res> {
  if (typeof id !== "string" || !id) return { ok: false, erreur: "Proposition inconnue." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutCompleterProposition(profilDe(g))) return { ok: false, erreur: "Réservé à l'équipe syndic." };
  try {
    await detacherProposition(id, g.nomComplet);
    revalidatePath(`/propositions/${id}`);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

const zOffre = z.object({ id: z.string().min(1), dateAgISO: zJour.optional(), debutISO: zJour.optional(), dureeMois: z.number().int().min(1).max(36).optional() });

export async function marquerOffreRemiseAction(input: unknown): Promise<Res> {
  const p = zOffre.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  const cible = await getProposition(p.data.id);
  if (!cible) return { ok: false, erreur: "Proposition introuvable." };
  if (!peutFaireOffre(profilDe(g), cible.agence)) return { ok: false, erreur: MESSAGE_RESERVE_DIRECTION };
  try {
    const { id, ...options } = p.data;
    await marquerOffreRemise(id, options, g.nomComplet);
    revalidatePath("/propositions");
    revalidatePath(`/propositions/${id}`);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}

const zElection = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(2).max(10),
  nomUsuel: z.string().trim().min(1).max(40),
  debutISO: zJour,
  dureeMois: z.number().int().min(1).max(36),
  agenceId: z.string().trim().max(80).optional(),
  managerId: z.string().trim().max(80).optional(),
  creerClientPennylane: z.boolean(),
  ouvrirDossierReprise: z.boolean(),
});

export async function elirePropositionAction(input: unknown): Promise<Res<{ coproCode: string; etapes: string[] }>> {
  const p = zElection.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  const cible = await getProposition(p.data.id);
  if (!cible) return { ok: false, erreur: "Proposition introuvable." };
  if (!peutElire(profilDe(g), cible.agence)) return { ok: false, erreur: MESSAGE_RESERVE_DIRECTION };
  try {
    const { id, ...choix } = p.data;
    const r = await elireProposition(
      id,
      { ...choix, ...(choix.agenceId ? {} : { agenceId: undefined }), ...(choix.managerId ? {} : { managerId: undefined }) },
      { nom: g.nomComplet, ...(g.email ? { email: g.email } : {}) },
    );
    revalidatePath("/propositions");
    revalidatePath(`/propositions/${id}`);
    return { ok: true, donnees: r };
  } catch (e) {
    return echecDepuis(e, "propositions");
  }
}
