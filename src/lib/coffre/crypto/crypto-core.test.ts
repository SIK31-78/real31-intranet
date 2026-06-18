// Tests du coeur crypto (ADR-025). On verifie les allers-retours et que les
// mauvaises cles ECHOUENT (c'est ce qui garantit le zero-knowledge).
import { describe, it, expect } from "vitest";
import {
  generateIdentityKeypair,
  exportPublicKey,
  importPublicKey,
  generateVaultKey,
  exportRawKey,
  importVaultKey,
  encryptJson,
  decryptJson,
  deriveUnlockKeyFromPassword,
  deriveUnlockKeyFromPrf,
  wrapPrivateKey,
  unwrapPrivateKey,
  wrapKeyForRecipient,
  unwrapKeyFromSender,
  toBase64,
  fromBase64,
  randomSalt,
} from "./crypto-core";

describe("chiffrement des secrets (AES-GCM)", () => {
  it("chiffre puis dechiffre un secret JSON", async () => {
    const key = await generateVaultKey();
    const secret = { titre: "Banque", url: "https://exemple.fr", login: "a@b.fr", motDePasse: "S3cr3t!" };
    const blob = await encryptJson(key, secret);
    expect(await decryptJson(key, blob)).toEqual(secret);
  });

  it("produit un IV different a chaque chiffrement", async () => {
    const key = await generateVaultKey();
    const a = await encryptJson(key, { x: 1 });
    const b = await encryptJson(key, { x: 1 });
    expect(toBase64(a.iv)).not.toEqual(toBase64(b.iv));
  });

  it("echoue a dechiffrer avec une autre cle", async () => {
    const blob = await encryptJson(await generateVaultKey(), { x: 1 });
    await expect(decryptJson(await generateVaultKey(), blob)).rejects.toThrow();
  });
});

describe("deverrouillage par mot de passe maitre (PBKDF2)", () => {
  it("deballe la cle privee avec le bon mot de passe", async () => {
    const { privateKey, publicKey } = await generateIdentityKeypair();
    const salt = randomSalt();
    const unlock = await deriveUnlockKeyFromPassword("correct horse battery", salt, 10_000);
    const wrapped = await wrapPrivateKey(unlock, privateKey);

    const unlock2 = await deriveUnlockKeyFromPassword("correct horse battery", salt, 10_000);
    const recovered = await unwrapPrivateKey(unlock2, wrapped);

    // La cle deballee fonctionne : un secret wrappe vers la cle publique est lisible.
    const vaultKey = await exportRawKey(await generateVaultKey());
    const enrobee = await wrapKeyForRecipient(publicKey, vaultKey);
    expect(Array.from(await unwrapKeyFromSender(recovered, enrobee))).toEqual(Array.from(vaultKey));
  });

  it("echoue avec un mauvais mot de passe", async () => {
    const { privateKey } = await generateIdentityKeypair();
    const salt = randomSalt();
    const wrapped = await wrapPrivateKey(await deriveUnlockKeyFromPassword("bon", salt, 10_000), privateKey);
    const mauvais = await deriveUnlockKeyFromPassword("mauvais", salt, 10_000);
    await expect(unwrapPrivateKey(mauvais, wrapped)).rejects.toThrow();
  });
});

describe("deverrouillage par PRF (passkey)", () => {
  it("deballe avec la meme sortie PRF, echoue avec une autre", async () => {
    const { privateKey } = await generateIdentityKeypair();
    const prf = randomSalt(32);
    const wrapped = await wrapPrivateKey(await deriveUnlockKeyFromPrf(prf), privateKey);

    await expect(unwrapPrivateKey(await deriveUnlockKeyFromPrf(prf), wrapped)).resolves.toBeDefined();
    await expect(unwrapPrivateKey(await deriveUnlockKeyFromPrf(randomSalt(32)), wrapped)).rejects.toThrow();
  });
});

describe("partage : wrap d'une cle de coffre vers un membre (ECIES)", () => {
  it("le destinataire deballe, un tiers echoue", async () => {
    const destinataire = await generateIdentityKeypair();
    const tiers = await generateIdentityKeypair();
    const vaultKey = await exportRawKey(await generateVaultKey());

    const enrobee = await wrapKeyForRecipient(destinataire.publicKey, vaultKey);

    expect(Array.from(await unwrapKeyFromSender(destinataire.privateKey, enrobee))).toEqual(Array.from(vaultKey));
    await expect(unwrapKeyFromSender(tiers.privateKey, enrobee)).rejects.toThrow();
  });

  it("flux complet : un membre partage un secret a un autre", async () => {
    // Alice cree un coffre, y met un secret, et partage la cle a Bob.
    const bob = await generateIdentityKeypair();
    const bobPubExport = await exportPublicKey(bob.publicKey);

    const vaultKey = await generateVaultKey();
    const secret = { titre: "Logiciel metier", motDePasse: "ABC-123" };
    const blob = await encryptJson(vaultKey, secret);

    // Alice wrappe la cle du coffre vers la cle publique de Bob (re-importee depuis la base).
    const enrobee = await wrapKeyForRecipient(await importPublicKey(bobPubExport), await exportRawKey(vaultKey));

    // Bob deballe la cle, la re-importe, et lit le secret.
    const cleRaw = await unwrapKeyFromSender(bob.privateKey, enrobee);
    expect(await decryptJson(await importVaultKey(cleRaw), blob)).toEqual(secret);
  });
});

describe("base64", () => {
  it("aller-retour", () => {
    const bytes = randomSalt(40);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
