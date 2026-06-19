"use server";

// Server actions du coffre. Le client fait toute la crypto et n'envoie QUE des
// blobs deja chiffres + sa cle publique (zero-knowledge, ADR-025). Le serveur
// persiste, sans jamais voir de clair.

import { getGestionnaireCourant } from "@/lib/auth/session";
import {
  enrolerCollaborateur,
  ajouterSecretCoffre,
  ajouterDeverrouillageCoffre,
  getApercuCoffre,
  getSecretsCoffre,
  creerCoffrePartage,
  octroyerAcces,
  retirerAcces,
  listerMembres,
  listerAnnuaire,
  importerSecretsCoffre,
  editerSecret,
  supprimerSecretCoffre,
  listerAuditCoffre,
  definirAdminCollaborateur,
} from "@/lib/services/coffre/coffre-service";
import type { BlobChiffreStocke, CleEnrobeeMembre, SecretChiffre, ActionAudit } from "@/lib/domain/coffre";

/** Verifie que l'appelant est membre du coffre ; renvoie son id pm_user. */
async function exigerMembre(coffreId: string): Promise<string> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.collaborateur || !apercu.coffres.some((c) => c.id === coffreId)) {
    throw new Error("Coffre non accessible");
  }
  return apercu.collaborateur.id;
}

/** Verifie que l'appelant est admin GLOBAL et membre du coffre ; renvoie son id. */
async function exigerAdmin(coffreId: string): Promise<string> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  const coffre = apercu.coffres.find((c) => c.id === coffreId);
  if (!apercu.collaborateur || !coffre) throw new Error("Coffre non accessible");
  if (!apercu.collaborateur.estAdmin) throw new Error("Reserve aux administrateurs");
  return apercu.collaborateur.id;
}

/** Verifie que l'appelant est admin global ; renvoie son id pm_user. */
async function exigerAdminGlobal(): Promise<string> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.collaborateur?.estAdmin) throw new Error("Reserve aux administrateurs");
  return apercu.collaborateur.id;
}

export interface PayloadEnrolement {
  publicKey: string;
  wrappedPrivateKey: BlobChiffreStocke;
  params: { salt: string; iterations: number };
  coffrePerso: { nom: string; wrappedVaultKey: CleEnrobeeMembre };
}

export async function enrolerAction(payload: PayloadEnrolement): Promise<{ userId: string; coffreId: string }> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  return enrolerCollaborateur({
    azureOid: g.id,
    email: "",
    nomComplet: g.nomComplet,
    publicKey: payload.publicKey,
    wrappedPrivateKey: payload.wrappedPrivateKey,
    params: payload.params,
    coffrePerso: payload.coffrePerso,
  });
}

export async function chargerSecretsAction(coffreId: string): Promise<SecretChiffre[]> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  // Cloisonnement : on ne sert les secrets que d'un coffre dont l'utilisateur est membre.
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.coffres.some((c) => c.id === coffreId)) throw new Error("Coffre non accessible");
  return getSecretsCoffre(coffreId);
}

export async function ajouterSecretAction(
  coffreId: string,
  blob: BlobChiffreStocke,
  cryptoVersion: number,
): Promise<{ id: string }> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  const collaborateur = apercu.collaborateur;
  if (!collaborateur || !apercu.coffres.some((c) => c.id === coffreId)) {
    throw new Error("Coffre non accessible");
  }
  const id = await ajouterSecretCoffre(coffreId, blob, cryptoVersion, collaborateur.id);
  return { id };
}

export async function ajouterPasskeyAction(
  wrappedPrivateKey: BlobChiffreStocke,
  params: { credentialId: string; salt: string },
): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.collaborateur) throw new Error("Coffre non initialise");
  await ajouterDeverrouillageCoffre(apercu.collaborateur.id, "passkey_prf", wrappedPrivateKey, params);
}

// --- Coffres partages -------------------------------------------------------

export async function creerCoffrePartageAction(
  scope: "network" | "service",
  nom: string,
  wrappedVaultKey: CleEnrobeeMembre,
  serviceId?: string,
): Promise<{ coffreId: string }> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.collaborateur) throw new Error("Coffre non initialise");
  if (!apercu.collaborateur.estAdmin) throw new Error("Seuls les administrateurs creent des coffres partages");
  const coffreId = await creerCoffrePartage(
    scope,
    nom,
    { userId: apercu.collaborateur.id, wrappedVaultKey },
    serviceId,
  );
  return { coffreId };
}

export interface MembreAffiche {
  userId: string;
  role: string;
  nom: string;
}

export async function listerMembresAction(coffreId: string): Promise<MembreAffiche[]> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.coffres.some((c) => c.id === coffreId)) throw new Error("Coffre non accessible");
  const [membres, annuaire] = await Promise.all([listerMembres(coffreId), listerAnnuaire()]);
  const nomPar = new Map(annuaire.map((a) => [a.id, a.nomComplet || a.email || a.id]));
  return membres.map((m) => ({ userId: m.userId, role: m.role, nom: nomPar.get(m.userId) ?? m.userId }));
}

export async function octroyerAccesAction(
  coffreId: string,
  userId: string,
  wrappedVaultKey: CleEnrobeeMembre,
): Promise<void> {
  const adminId = await exigerAdmin(coffreId);
  await octroyerAcces(coffreId, userId, wrappedVaultKey, adminId);
}

export async function retirerAccesAction(coffreId: string, userId: string): Promise<void> {
  await exigerAdmin(coffreId);
  await retirerAcces(coffreId, userId);
}

export async function importerSecretsAction(
  coffreId: string,
  items: { blob: BlobChiffreStocke; cryptoVersion: number }[],
): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) throw new Error("Non authentifie");
  const apercu = await getApercuCoffre(g.id);
  if (!apercu.collaborateur || !apercu.coffres.some((c) => c.id === coffreId)) {
    throw new Error("Coffre non accessible");
  }
  await importerSecretsCoffre(coffreId, items, apercu.collaborateur.id);
}

export async function modifierSecretAction(
  coffreId: string,
  secretId: string,
  blob: BlobChiffreStocke,
  cryptoVersion: number,
): Promise<void> {
  const userId = await exigerMembre(coffreId);
  await editerSecret(coffreId, secretId, blob, cryptoVersion, userId);
}

export async function supprimerSecretAction(coffreId: string, secretId: string): Promise<void> {
  const userId = await exigerMembre(coffreId);
  await supprimerSecretCoffre(coffreId, secretId, userId);
}

export interface EntreeAuditAffichee {
  id: string;
  action: ActionAudit;
  nom: string;
  createdAt: string;
  details?: Record<string, unknown>;
}

export async function listerAuditAction(coffreId: string): Promise<EntreeAuditAffichee[]> {
  await exigerMembre(coffreId);
  const [entrees, annuaire] = await Promise.all([listerAuditCoffre(coffreId), listerAnnuaire()]);
  const nomPar = new Map(annuaire.map((a) => [a.id, a.nomComplet || a.email || a.id]));
  return entrees.map((e) => ({
    id: e.id,
    action: e.action,
    nom: e.userId ? nomPar.get(e.userId) ?? "Inconnu" : "Inconnu",
    createdAt: e.createdAt,
    ...(e.details ? { details: e.details } : {}),
  }));
}

// --- Gouvernance des roles --------------------------------------------------

export async function definirAdminAction(cibleUserId: string, estAdmin: boolean): Promise<void> {
  const moi = await exigerAdminGlobal();
  // Garde-fou : on ne peut pas se retirer soi-meme le role (risque de blocage).
  if (cibleUserId === moi && !estAdmin) {
    throw new Error("Tu ne peux pas te retirer toi-meme le role admin.");
  }
  await definirAdminCollaborateur(cibleUserId, estAdmin);
}
