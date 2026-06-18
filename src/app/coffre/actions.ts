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
} from "@/lib/services/coffre/coffre-service";
import type { BlobChiffreStocke, CleEnrobeeMembre, SecretChiffre } from "@/lib/domain/coffre";

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
