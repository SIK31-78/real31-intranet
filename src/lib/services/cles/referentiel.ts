// Le referentiel du module cles : trousseaux (fiche, acces, composition) et entreprises.
// Toute modification de trousseau laisse un mouvement ; l'entreprise est cabinet.

import { getClesEntrepriseRepository, getClesRepository } from "@/lib/adapters/router";
import { normaliserNomEntreprise, numeroCanonique } from "@/lib/domain/cles/normaliser";
import type { Acces, AdresseEntreprise, Contact, ElementComposition, Entreprise, Trousseau } from "@/lib/domain/cles/types";
import { AGENCES_CLES } from "@/lib/domain/cles/types";
import { estDirectionCles, MESSAGE_HORS_AGENCE, MESSAGE_RESERVE_DIRECTION_CLES, peutOperer, type Acteur } from "./contexte";

export interface TrousseauInput {
  agenceCode?: string;
  numero: string;
  libelle: string;
  emplacement?: string;
  composition: ElementComposition[];
  acces: Omit<Acces, "id">[];
  note?: string;
  jumeauDe?: string;
}

function nettoyerComposition(c: ElementComposition[]): ElementComposition[] {
  return c
    .map((e) => ({ type: e.type, libelle: (e.libelle ?? "").trim(), quantite: Math.max(1, Math.round(Number(e.quantite) || 1)) }))
    .filter((e) => e.type);
}

function nettoyerAcces(acces: Omit<Acces, "id">[]): Omit<Acces, "id">[] {
  const propres = acces
    .filter((a) => a.bien.type !== "copro" || a.bien.code.trim())
    .map((a, i) => ({ ...a, bien: a.bien.type === "copro" ? { type: "copro" as const, code: a.bien.code.trim().toUpperCase() } : a.bien, libelle: (a.libelle ?? "").trim(), immeuble: a.immeuble?.trim() || undefined, ordre: i }));
  if (propres.length === 0) throw new Error("Un trousseau ouvre au moins une copropriété.");
  return propres;
}

export async function creerTrousseau(input: TrousseauInput, acteur: Acteur): Promise<Trousseau> {
  const agenceCode = (input.agenceCode ?? acteur.agence ?? "").toUpperCase();
  if (!AGENCES_CLES.includes(agenceCode as (typeof AGENCES_CLES)[number])) throw new Error("Agence inconnue : précise l'agence du trousseau.");
  if (!peutOperer(acteur, agenceCode)) throw new Error(MESSAGE_HORS_AGENCE);
  const numero = numeroCanonique(input.numero);
  if (!numero) throw new Error("Le numéro du trousseau est obligatoire.");
  const repo = getClesRepository();
  const t = await repo.creerTrousseau({
    agenceCode,
    numero,
    libelle: input.libelle.trim(),
    ...(input.emplacement?.trim() ? { emplacement: input.emplacement.trim().toUpperCase() } : {}),
    composition: nettoyerComposition(input.composition),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.jumeauDe ? { jumeauDe: input.jumeauDe } : {}),
    source: "intranet",
    creeParNom: acteur.nom,
    acces: nettoyerAcces(input.acces),
  });
  await repo.ajouterMouvement({ trousseauId: t.id, type: "creation", parUserId: acteur.id, parNom: acteur.nom, agenceCode, details: { numero, libelle: t.libelle } });
  return t;
}

export async function modifierTrousseau(id: string, input: TrousseauInput, acteur: Acteur): Promise<Trousseau> {
  const repo = getClesRepository();
  const t = await repo.getTrousseau(id);
  if (!t) throw new Error("Trousseau introuvable.");
  if (!peutOperer(acteur, t.agenceCode)) throw new Error(MESSAGE_HORS_AGENCE);
  const numero = numeroCanonique(input.numero);
  if (!numero) throw new Error("Le numéro du trousseau est obligatoire.");
  const composition = nettoyerComposition(input.composition);
  const acces = nettoyerAcces(input.acces).map((a, i) => ({ ...a, id: t.acces[i]?.id ?? `${t.id}-a${i}` }));
  const maj: Trousseau = {
    ...t,
    numero,
    libelle: input.libelle.trim(),
    composition,
    acces,
  };
  if (input.emplacement?.trim()) maj.emplacement = input.emplacement.trim().toUpperCase();
  else delete maj.emplacement;
  if (input.note?.trim()) maj.note = input.note.trim();
  else delete maj.note;
  if (input.jumeauDe) maj.jumeauDe = input.jumeauDe;
  else delete maj.jumeauDe;
  await repo.sauverTrousseau(maj);
  const compositionChangee = JSON.stringify(t.composition) !== JSON.stringify(composition);
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: compositionChangee ? "composition_modifiee" : "modification",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    details: compositionChangee ? { avant: t.composition, apres: composition } : { avant: { numero: t.numero, libelle: t.libelle, emplacement: t.emplacement, acces: t.acces.length }, apres: { numero, libelle: maj.libelle, emplacement: maj.emplacement, acces: acces.length } },
  });
  return maj;
}

export async function poserPhoto(id: string, chemin: string, acteur: Acteur): Promise<void> {
  const repo = getClesRepository();
  const t = await repo.getTrousseau(id);
  if (!t) throw new Error("Trousseau introuvable.");
  if (!peutOperer(acteur, t.agenceCode)) throw new Error(MESSAGE_HORS_AGENCE);
  await repo.sauverTrousseau({ ...t, photoChemin: chemin });
  await repo.ajouterMouvement({ trousseauId: t.id, type: "modification", parUserId: acteur.id, parNom: acteur.nom, agenceCode: t.agenceCode, details: { motif: "photo mise à jour" } });
}

export interface EntrepriseInput {
  nom: string;
  telephone?: string;
  email?: string;
  adresse?: AdresseEntreprise;
  contacts?: Contact[];
  note?: string;
  relances?: boolean;
  estaleSupplierId?: string;
}

function nettoyerContacts(contacts: Contact[] | undefined): Contact[] {
  return (contacts ?? [])
    .map((c) => ({ nom: (c.nom ?? "").trim(), telephone: c.telephone?.trim() || undefined, email: c.email?.trim().toLowerCase() || undefined, principal: Boolean(c.principal) }))
    .filter((c) => c.nom);
}

/** Creer une entreprise (au comptoir ou depuis la liste). Refuse un doublon de nom, en le nommant. */
export async function creerEntreprise(input: EntrepriseInput, acteur: Acteur): Promise<Entreprise> {
  const nom = input.nom.trim();
  if (nom.length < 2) throw new Error("Le nom de l'entreprise est trop court.");
  const nomNormalise = normaliserNomEntreprise(nom);
  if (!nomNormalise) throw new Error("Le nom de l'entreprise est illisible.");
  const repo = getClesEntrepriseRepository();
  const existante = await repo.getParNomNormalise(nomNormalise);
  if (existante) throw new Error(`« ${existante.nom} » existe déjà : choisis-la dans la liste.`);
  return repo.creer({
    nom,
    nomNormalise,
    ...(input.telephone?.trim() ? { telephone: input.telephone.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim().toLowerCase() } : {}),
    ...(input.adresse ? { adresse: input.adresse } : {}),
    contacts: nettoyerContacts(input.contacts),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    statut: "active",
    relances: input.relances ?? true,
    ...(input.estaleSupplierId ? { estaleSupplierId: input.estaleSupplierId } : {}),
    source: "intranet",
    creeParNom: acteur.nom,
  });
}

export async function modifierEntreprise(id: string, input: EntrepriseInput): Promise<Entreprise> {
  const repo = getClesEntrepriseRepository();
  const e = await repo.get(id);
  if (!e) throw new Error("Entreprise introuvable.");
  const nom = input.nom.trim();
  if (nom.length < 2) throw new Error("Le nom de l'entreprise est trop court.");
  const nomNormalise = normaliserNomEntreprise(nom);
  const doublon = await repo.getParNomNormalise(nomNormalise);
  if (doublon && doublon.id !== e.id) throw new Error(`« ${doublon.nom} » existe déjà.`);
  const maj: Entreprise = { ...e, nom, nomNormalise, contacts: nettoyerContacts(input.contacts), relances: input.relances ?? e.relances };
  const champ = <K extends "telephone" | "email" | "note" | "estaleSupplierId">(k: K, v: string | undefined) => {
    if (v?.trim()) maj[k] = (k === "email" ? v.trim().toLowerCase() : v.trim()) as Entreprise[K];
    else delete maj[k];
  };
  champ("telephone", input.telephone);
  champ("email", input.email);
  champ("note", input.note);
  champ("estaleSupplierId", input.estaleSupplierId);
  if (input.adresse && Object.values(input.adresse).some((v) => v?.trim())) maj.adresse = input.adresse;
  else delete maj.adresse;
  await repo.sauver(maj);
  return maj;
}

/** Bloquer (motif obligatoire) ou debloquer une entreprise : la direction. */
export async function bloquerEntreprise(id: string, bloquee: boolean, motif: string | undefined, acteur: Acteur): Promise<Entreprise> {
  if (!estDirectionCles(acteur)) throw new Error(MESSAGE_RESERVE_DIRECTION_CLES);
  const repo = getClesEntrepriseRepository();
  const e = await repo.get(id);
  if (!e) throw new Error("Entreprise introuvable.");
  if (bloquee && !motif?.trim()) throw new Error("Un motif est obligatoire pour bloquer une entreprise.");
  const maj: Entreprise = { ...e, statut: bloquee ? "bloquee" : "active" };
  if (bloquee) maj.motifBlocage = motif!.trim();
  else delete maj.motifBlocage;
  await repo.sauver(maj);
  return maj;
}
