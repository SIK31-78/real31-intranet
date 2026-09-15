"use server";

// Server Actions du module Propositions (ADR-039). Ouvertes a tout collaborateur
// connecte : la saisie rapide est faite pour celui qui decroche le telephone.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { ORIGINES, STATUTS_PROPOSITION } from "@/lib/domain/proposition/proposition";
import {
  calculerPrix,
  creerProposition,
  detacherProposition,
  mettreAJourProposition,
  rattacherProposition,
  rechercherRegistre,
  type PrixCalcule,
} from "@/lib/services/proposition/propositions";
import type { RegistreCopro } from "@/lib/ports/proposition-repository";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

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
  if (typeof texte !== "string" || texte.trim().length < 3) return { ok: true, donnees: [] };
  try {
    return { ok: true, donnees: await rechercherRegistre(texte.slice(0, 120)) };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
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
    return { ok: false, erreur: (e as Error).message };
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
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function calculerPrixAction(immeuble: unknown): Promise<Res<PrixCalcule>> {
  const p = zImmeuble.safeParse(immeuble);
  if (!p.success) return { ok: false, erreur: "Saisie invalide." };
  try {
    return { ok: true, donnees: await calculerPrix(epurer(p.data)) };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

const zRattacher = z.object({ id: z.string().min(1), immatriculation: z.string().trim().regex(/^[A-Z]{2}\d{7}$/i) });

export async function rattacherPropositionAction(input: unknown): Promise<Res> {
  const p = zRattacher.safeParse(input);
  if (!p.success) return { ok: false, erreur: "Immatriculation invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    await rattacherProposition(p.data.id, p.data.immatriculation.toUpperCase(), g.nomComplet);
    revalidatePath("/propositions");
    revalidatePath(`/propositions/${p.data.id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function detacherPropositionAction(id: unknown): Promise<Res> {
  if (typeof id !== "string" || !id) return { ok: false, erreur: "Proposition inconnue." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    await detacherProposition(id, g.nomComplet);
    revalidatePath(`/propositions/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
