// Test d'integration phase 1 : crypto reelle + mock store + ports (ADR-025).
// Prouve le chemin complet sans serveur : enrolement, coffre perso, secret
// chiffre stocke puis relu, partage a un 2e collaborateur. C'est exactement la
// glue que la couche service/client portera (base64 <-> Uint8Array).
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
  wrapPrivateKey,
  unwrapPrivateKey,
  wrapKeyForRecipient,
  unwrapKeyFromSender,
  toBase64,
  fromBase64,
  randomSalt,
  type BlobChiffre,
  type CleEnrobeeDestinataire,
} from "./crypto/crypto-core";
import { MockCoffreRepository } from "@/lib/adapters/mock/mock-coffre-repository";
import { MockCoffreIdentiteRepository } from "@/lib/adapters/mock/mock-coffre-identite-repository";
import type { BlobChiffreStocke, CleEnrobeeMembre, SecretClair } from "@/lib/domain/coffre";

// --- glue de serialisation (base64 <-> octets), future couche service --------
const enBlob = (b: BlobChiffre): BlobChiffreStocke => ({ iv: toBase64(b.iv), ciphertext: toBase64(b.ciphertext) });
const deBlob = (s: BlobChiffreStocke): BlobChiffre => ({ iv: fromBase64(s.iv), ciphertext: fromBase64(s.ciphertext) });
const enMembre = (e: CleEnrobeeDestinataire): CleEnrobeeMembre => ({
  ephemeralPublicKey: toBase64(e.ephemeralPublicKey),
  iv: toBase64(e.iv),
  ciphertext: toBase64(e.ciphertext),
});
const deMembre = (m: CleEnrobeeMembre): CleEnrobeeDestinataire => ({
  ephemeralPublicKey: fromBase64(m.ephemeralPublicKey),
  iv: fromBase64(m.iv),
  ciphertext: fromBase64(m.ciphertext),
});

describe("flux coffre phase 1 (bout en bout, mock + crypto reelle)", () => {
  it("enrolement, coffre perso, secret stocke chiffre puis relu, puis partage", async () => {
    const identites = new MockCoffreIdentiteRepository();
    const coffres = new MockCoffreRepository();

    // 1. Alice s'enrole : paire d'identite + cle publique en base + cle privee
    //    wrappee par son mot de passe maitre.
    const aliceKeys = await generateIdentityKeypair();
    const alice = await identites.creer({
      azureOid: "oid-alice",
      email: "alice@real31.fr",
      publicKey: toBase64(await exportPublicKey(aliceKeys.publicKey)),
    });
    const salt = randomSalt();
    await identites.ajouterDeverrouillage(
      alice.id,
      "master_password",
      enBlob(await wrapPrivateKey(await deriveUnlockKeyFromPassword("motdepasse-alice", salt, 10_000), aliceKeys.privateKey)),
      { salt: toBase64(salt), iterations: 10_000 },
    );

    // 2. Alice cree un coffre perso : cle de coffre wrappee vers sa propre cle publique.
    const vaultKey = await generateVaultKey();
    const vaultKeyRaw = await exportRawKey(vaultKey);
    const coffreId = await coffres.creerCoffre(
      { scope: "personal", nom: "Mes mots de passe", ownerId: alice.id },
      { userId: alice.id, wrappedVaultKey: enMembre(await wrapKeyForRecipient(aliceKeys.publicKey, vaultKeyRaw)) },
    );

    // 3. Alice enregistre un secret (titre/url/login/mdp tout chiffre).
    const secret: SecretClair = { titre: "Logiciel Vente", url: "https://app.vente.fr", login: "alice", motDePasse: "Z3-secret!" };
    await coffres.ajouterSecret(coffreId, enBlob(await encryptJson(vaultKey, secret)), 1, alice.id);

    // 4. Alice "se reconnecte" : deballe sa cle privee (mot de passe), recupere
    //    la cle du coffre, dechiffre le secret.
    const dev = (await identites.listerDeverrouillages(alice.id))[0];
    const unlock = await deriveUnlockKeyFromPassword("motdepasse-alice", fromBase64(dev.params.salt as string), 10_000);
    const alicePriv = await unwrapPrivateKey(unlock, deBlob(dev.wrappedPrivateKey));

    const monCoffre = (await coffres.listerCoffresAccessibles(alice.id)).find((c) => c.id === coffreId)!;
    const cleRaw = await unwrapKeyFromSender(alicePriv, deMembre(monCoffre.wrappedVaultKey));
    const cleCoffre = await importVaultKey(cleRaw);
    const [secretStocke] = await coffres.listerSecrets(coffreId);
    expect(await decryptJson<SecretClair>(cleCoffre, deBlob(secretStocke.blob))).toEqual(secret);

    // 5. Partage a Bob : il s'enrole, Alice wrappe la cle du coffre vers la cle
    //    publique de Bob et cree son appartenance. Bob lit le secret.
    const bobKeys = await generateIdentityKeypair();
    const bob = await identites.creer({
      azureOid: "oid-bob",
      email: "bob@real31.fr",
      publicKey: toBase64(await exportPublicKey(bobKeys.publicKey)),
    });
    const bobPub = (await identites.getClePublique(bob.id))!;
    await coffres.ajouterMembership({
      coffreId,
      userId: bob.id,
      role: "member",
      wrappedVaultKey: enMembre(await wrapKeyForRecipient(await importPublicKey(fromBase64(bobPub.publicKey)), cleRaw)),
      grantedBy: alice.id,
    });

    const coffreDeBob = (await coffres.listerCoffresAccessibles(bob.id)).find((c) => c.id === coffreId)!;
    const cleBob = await importVaultKey(await unwrapKeyFromSender(bobKeys.privateKey, deMembre(coffreDeBob.wrappedVaultKey)));
    expect(await decryptJson<SecretClair>(cleBob, deBlob(secretStocke.blob))).toEqual(secret);
  });
});
