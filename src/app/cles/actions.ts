"use server";

// Server Actions du module Gestion des cles (ADR-040). Pattern actionGestionnaire :
// zod -> session -> corps -> Res. Les gardes d'agence et de direction vivent dans les
// services (contexte.ts) ; ici on ne fait que traduire l'entree et revalider.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { TYPES_ACCES, TYPES_ELEMENT } from "@/lib/domain/cles/types";
import { jourParis } from "@/lib/services/date-du-jour";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { annulerReservation, corrigerPret, CHAMPS_CORRIGEABLES, enregistrerRetour, marquer, prolonger, reserver, sortir } from "@/lib/services/cles/comptoir";
import { bloquerEntreprise, creerEntreprise, creerTrousseau, modifierEntreprise, modifierTrousseau } from "@/lib/services/cles/referentiel";
import { indexRecherche, listerEntreprises } from "@/lib/services/cles/lecture";
import type { EntreeIndex } from "@/lib/domain/cles/recherche";

const zId = z.string().min(1).max(80);
const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zContact = z.object({
  nom: z.string().trim().max(120),
  telephone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  principal: z.boolean().optional(),
});

function revaliderTrousseau(id: string) {
  revalidatePath("/cles");
  revalidatePath(`/cles/trousseaux/${id}`);
  revalidatePath("/cles/journal");
  revalidatePath("/cles/entreprises");
  revalidatePath("/accueil");
}

// --- Comptoir -----------------------------------------------------------------------

const zSortie = z.object({
  trousseauId: zId,
  type: z.enum(["entreprise", "interne"]),
  entrepriseId: zId.optional(),
  contact: zContact.optional(),
  retourPrevuLeISO: zJour,
  motif: z.string().trim().max(300).optional(),
  reservationId: zId.optional(),
  confirme: z.boolean().optional(),
});

export async function sortirAction(input: unknown): Promise<Res<{ pretId?: string; confirmationRequise?: string }>> {
  return actionGestionnaire(zSortie, input, "cles-sortie", async (d, g) => {
    const acteur = await acteurCles(g);
    const r = await sortir({ ...d, contact: d.contact?.nom ? d.contact : undefined, aujourdhuiISO: jourParis() }, acteur);
    if ("confirmationRequise" in r) return { confirmationRequise: r.confirmationRequise };
    revaliderTrousseau(d.trousseauId);
    return { pretId: r.pret.id };
  });
}

const zRetour = z.object({
  trousseauId: zId,
  conformite: z.enum(["complet", "incomplet", "endommage"]),
  commentaire: z.string().trim().max(1000).optional(),
});

export async function enregistrerRetourAction(input: unknown): Promise<Res<{ pretId: string }>> {
  return actionGestionnaire(zRetour, input, "cles-retour", async (d, g) => {
    const acteur = await acteurCles(g);
    const pret = await enregistrerRetour({ ...d, aujourdhuiISO: jourParis() }, acteur);
    revaliderTrousseau(d.trousseauId);
    return { pretId: pret.id };
  });
}

const zReservation = z.object({
  trousseauId: zId,
  entrepriseId: zId,
  contact: zContact.optional(),
  debutISO: zJour,
  finPrevueISO: zJour,
  motif: z.string().trim().max(300).optional(),
});

export async function reserverAction(input: unknown): Promise<Res<{ reservationId: string; avertissement?: string }>> {
  return actionGestionnaire(zReservation, input, "cles-reservation", async (d, g) => {
    const acteur = await acteurCles(g);
    const r = await reserver({ ...d, contact: d.contact?.nom ? d.contact : undefined, aujourdhuiISO: jourParis() }, acteur);
    revaliderTrousseau(d.trousseauId);
    return { reservationId: r.reservation.id, ...(r.avertissement ? { avertissement: r.avertissement } : {}) };
  });
}

const zAnnulation = z.object({ reservationId: zId, trousseauId: zId, motif: z.string().trim().min(1).max(300) });

export async function annulerReservationAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zAnnulation, input, "cles-annulation", async (d, g) => {
    await annulerReservation({ reservationId: d.reservationId, motif: d.motif }, await acteurCles(g));
    revaliderTrousseau(d.trousseauId);
  });
}

const zProlongation = z.object({ trousseauId: zId, retourPrevuLeISO: zJour, motif: z.string().trim().max(300).optional() });

export async function prolongerAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zProlongation, input, "cles-prolongation", async (d, g) => {
    await prolonger({ ...d, aujourdhuiISO: jourParis() }, await acteurCles(g));
    revaliderTrousseau(d.trousseauId);
  });
}

const zMarquage = z.object({ trousseauId: zId, marquage: z.enum(["introuvable", "retrouve", "retire"]), motif: z.string().trim().max(300).optional() });

export async function marquerAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zMarquage, input, "cles-marquage", async (d, g) => {
    await marquer(d, await acteurCles(g));
    revaliderTrousseau(d.trousseauId);
  });
}

const zCorrection = z.object({ pretId: zId, trousseauId: zId, champ: z.enum(CHAMPS_CORRIGEABLES), valeur: z.string().trim().max(1000), motif: z.string().trim().min(1).max(300) });

export async function corrigerPretAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zCorrection, input, "cles-correction", async (d, g) => {
    await corrigerPret(d, await acteurCles(g));
    revaliderTrousseau(d.trousseauId);
  });
}

// --- Referentiel : trousseaux -------------------------------------------------------

const zAcces = z.object({
  coproCode: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/),
  immeuble: z.string().trim().max(120).optional(),
  types: z.array(z.enum(TYPES_ACCES)).max(14),
  libelle: z.string().trim().max(120),
});
const zElement = z.object({ type: z.enum(TYPES_ELEMENT), libelle: z.string().trim().max(120), quantite: z.number().int().min(1).max(99) });
const zTrousseau = z.object({
  agenceCode: z.string().trim().toUpperCase().max(4).optional(),
  numero: z.string().trim().min(1).max(20),
  libelle: z.string().trim().max(120),
  emplacement: z.string().trim().max(40).optional(),
  composition: z.array(zElement).max(30),
  acces: z.array(zAcces).min(1).max(12),
  note: z.string().trim().max(1000).optional(),
});

function versInput(d: z.output<typeof zTrousseau>) {
  return {
    ...d,
    acces: d.acces.map((a, i) => ({ bien: { type: "copro" as const, code: a.coproCode }, immeuble: a.immeuble, types: a.types, libelle: a.libelle, ordre: i })),
  };
}

export async function creerTrousseauAction(input: unknown): Promise<Res<{ trousseauId: string }>> {
  return actionGestionnaire(zTrousseau, input, "cles-trousseau", async (d, g) => {
    const t = await creerTrousseau(versInput(d), await acteurCles(g));
    revaliderTrousseau(t.id);
    return { trousseauId: t.id };
  });
}

export async function modifierTrousseauAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zTrousseau.extend({ trousseauId: zId }), input, "cles-trousseau", async ({ trousseauId, ...d }, g) => {
    await modifierTrousseau(trousseauId, versInput(d), await acteurCles(g));
    revaliderTrousseau(trousseauId);
  });
}

// --- Referentiel : entreprises ------------------------------------------------------

const zEntreprise = z.object({
  nom: z.string().trim().min(2).max(160),
  telephone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  adresse: z.object({ ligne1: z.string().trim().max(160).optional(), ligne2: z.string().trim().max(160).optional(), codePostal: z.string().trim().max(10).optional(), ville: z.string().trim().max(80).optional() }).optional(),
  contacts: z.array(zContact).max(20).optional(),
  note: z.string().trim().max(1000).optional(),
  relances: z.boolean().optional(),
});

export async function creerEntrepriseAction(input: unknown): Promise<Res<{ entrepriseId: string; nom: string }>> {
  return actionGestionnaire(zEntreprise, input, "cles-entreprise", async (d, g) => {
    const e = await creerEntreprise(d, await acteurCles(g));
    revalidatePath("/cles/entreprises");
    revalidatePath("/cles");
    return { entrepriseId: e.id, nom: e.nom };
  });
}

export async function modifierEntrepriseAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zEntreprise.extend({ entrepriseId: zId }), input, "cles-entreprise", async ({ entrepriseId, ...d }) => {
    await modifierEntreprise(entrepriseId, d);
    revalidatePath("/cles/entreprises");
    revalidatePath(`/cles/entreprises/${entrepriseId}`);
    revalidatePath("/cles");
  });
}

const zBlocage = z.object({ entrepriseId: zId, bloquee: z.boolean(), motif: z.string().trim().max(300).optional() });

export async function bloquerEntrepriseAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zBlocage, input, "cles-entreprise", async (d, g) => {
    await bloquerEntreprise(d.entrepriseId, d.bloquee, d.motif, await acteurCles(g));
    revalidatePath("/cles/entreprises");
    revalidatePath(`/cles/entreprises/${d.entrepriseId}`);
    revalidatePath("/cles");
  });
}

// --- Lectures a la demande (comptoir) -------------------------------------------------

/** L'index de recherche du comptoir (trousseaux, copros, entreprises), charge une fois par page. */
export async function chargerIndexClesAction(): Promise<EntreeIndex[]> {
  const res = await actionGestionnaire(z.object({}), {}, "cles-index", async (_d, g) => {
    const acteur = await acteurCles(g);
    return indexRecherche(acteur.agence, jourParis());
  });
  return res.ok && res.donnees ? res.donnees : [];
}

export interface EntrepriseChoix {
  id: string;
  nom: string;
  detenus: number;
  enRetard: number;
  bloquee: boolean;
  contacts: { nom: string; telephone?: string; email?: string; principal?: boolean }[];
}

/** Les entreprises pour la combobox du comptoir (avec ce qu'elles detiennent). */
export async function chargerEntreprisesAction(): Promise<EntrepriseChoix[]> {
  const res = await actionGestionnaire(z.object({}), {}, "cles-entreprises", async () => {
    const liste = await listerEntreprises(jourParis());
    return liste.map((e) => ({ id: e.id, nom: e.nom, detenus: e.detenus, enRetard: e.enRetard, bloquee: e.statut === "bloquee", contacts: e.contacts }));
  });
  return res.ok && res.donnees ? res.donnees : [];
}
