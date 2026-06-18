// API crypto haut niveau du coffre, cote CLIENT (ADR-025). Orchestre
// lib/coffre/crypto/crypto-core et fait la conversion base64 <-> octets pour
// dialoguer avec les ports (qui stockent du base64). Le composant n'appelle que
// ces fonctions, jamais crypto-core directement.

import * as cc from "./crypto/crypto-core";
import { creerPasskeyPrf, obtenirPrf } from "./crypto/webauthn-prf";
import type {
  BlobChiffreStocke,
  CleEnrobeeMembre,
  SecretClair,
  Deverrouillage,
} from "@/lib/domain/coffre";

export const CRYPTO_VERSION = cc.CRYPTO_VERSION;

// --- serialisation base64 <-> octets ---------------------------------------
const enBlob = (b: cc.BlobChiffre): BlobChiffreStocke => ({
  iv: cc.toBase64(b.iv),
  ciphertext: cc.toBase64(b.ciphertext),
});
const deBlob = (s: BlobChiffreStocke): cc.BlobChiffre => ({
  iv: cc.fromBase64(s.iv),
  ciphertext: cc.fromBase64(s.ciphertext),
});
const enMembre = (e: cc.CleEnrobeeDestinataire): CleEnrobeeMembre => ({
  ephemeralPublicKey: cc.toBase64(e.ephemeralPublicKey),
  iv: cc.toBase64(e.iv),
  ciphertext: cc.toBase64(e.ciphertext),
});
const deMembre = (m: CleEnrobeeMembre): cc.CleEnrobeeDestinataire => ({
  ephemeralPublicKey: cc.fromBase64(m.ephemeralPublicKey),
  iv: cc.fromBase64(m.iv),
  ciphertext: cc.fromBase64(m.ciphertext),
});

// --- Enrolement / deverrouillage (chemin mot de passe maitre) ---------------

/** Ce qui doit etre persiste cote serveur a l'enrolement (jamais de clair). */
export interface DonneesEnrolement {
  publicKey: string;
  wrappedPrivateKey: BlobChiffreStocke;
  params: { salt: string; iterations: number };
}

/** Genere l'identite de l'utilisateur et wrappe sa cle privee avec le mot de
 *  passe maitre. Renvoie ce qu'il faut persister + la session crypto en memoire. */
export async function enrolerMotDePasse(
  motDePasse: string,
): Promise<{ donnees: DonneesEnrolement; privateKey: CryptoKey; publicKey: string }> {
  const keypair = await cc.generateIdentityKeypair();
  const salt = cc.randomSalt();
  const unlock = await cc.deriveUnlockKeyFromPassword(motDePasse, salt);
  const wrapped = await cc.wrapPrivateKey(unlock, keypair.privateKey);
  const publicKey = cc.toBase64(await cc.exportPublicKey(keypair.publicKey));
  return {
    donnees: {
      publicKey,
      wrappedPrivateKey: enBlob(wrapped),
      params: { salt: cc.toBase64(salt), iterations: cc.PBKDF2_ITERATIONS },
    },
    privateKey: keypair.privateKey,
    publicKey,
  };
}

/** Deballe la cle privee avec le mot de passe maitre. Throw si mauvais mot de passe. */
export async function deverrouillerMotDePasse(motDePasse: string, dev: Deverrouillage): Promise<CryptoKey> {
  const salt = cc.fromBase64(dev.params.salt as string);
  const iterations = (dev.params.iterations as number) || cc.PBKDF2_ITERATIONS;
  const unlock = await cc.deriveUnlockKeyFromPassword(motDePasse, salt, iterations);
  return cc.unwrapPrivateKey(unlock, deBlob(dev.wrappedPrivateKey));
}

// --- Deverrouillage par passkey (PRF) --------------------------------------

/** Donnees a persister pour une nouvelle methode passkey (cle privee re-wrappee). */
export interface DonneesPasskey {
  wrappedPrivateKey: BlobChiffreStocke;
  params: { credentialId: string; salt: string };
}

/** Active une passkey pour un utilisateur DEJA deverrouille (on a sa cle privee).
 *  Cree la passkey, en derive la cle d'enrobage (PRF) et re-wrappe la cle privee. */
export async function activerPasskey(
  privateKey: CryptoKey,
  userId: string,
  userName: string,
  displayName: string,
): Promise<DonneesPasskey> {
  const pk = await creerPasskeyPrf(userId, userName, displayName);
  const unlock = await cc.deriveUnlockKeyFromPrf(pk.prfOutput);
  const wrapped = await cc.wrapPrivateKey(unlock, privateKey);
  return { wrappedPrivateKey: enBlob(wrapped), params: { credentialId: pk.credentialId, salt: pk.salt } };
}

/** Deballe la cle privee via la passkey (empreinte / Windows Hello / PIN). */
export async function deverrouillerPasskey(dev: Deverrouillage): Promise<CryptoKey> {
  const prf = await obtenirPrf(dev.params.credentialId as string, dev.params.salt as string);
  const unlock = await cc.deriveUnlockKeyFromPrf(prf);
  return cc.unwrapPrivateKey(unlock, deBlob(dev.wrappedPrivateKey));
}

// --- Cles de coffre ---------------------------------------------------------

/** Cree une cle de coffre neuve, enrobee vers une cle publique (base64). */
export async function creerCleCoffrePour(
  publicKeyB64: string,
): Promise<{ vaultKey: CryptoKey; wrappedVaultKey: CleEnrobeeMembre }> {
  const vaultKey = await cc.generateVaultKey();
  const raw = await cc.exportRawKey(vaultKey);
  const pub = await cc.importPublicKey(cc.fromBase64(publicKeyB64));
  return { vaultKey, wrappedVaultKey: enMembre(await cc.wrapKeyForRecipient(pub, raw)) };
}

/** Ouvre la cle d'un coffre dont on est membre, avec sa cle privee. */
export async function ouvrirCleCoffre(privateKey: CryptoKey, wrapped: CleEnrobeeMembre): Promise<CryptoKey> {
  return cc.importVaultKey(await cc.unwrapKeyFromSender(privateKey, deMembre(wrapped)));
}

// --- Secrets ----------------------------------------------------------------

export async function chiffrerSecret(vaultKey: CryptoKey, secret: SecretClair): Promise<BlobChiffreStocke> {
  return enBlob(await cc.encryptJson(vaultKey, secret));
}

export async function dechiffrerSecret(vaultKey: CryptoKey, blob: BlobChiffreStocke): Promise<SecretClair> {
  return cc.decryptJson<SecretClair>(vaultKey, deBlob(blob));
}
