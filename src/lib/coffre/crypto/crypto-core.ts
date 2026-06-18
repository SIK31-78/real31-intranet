// Coeur cryptographique du gestionnaire de mots de passe (ADR-025).
// Zero-knowledge : tout se passe ICI, cote client (Web Crypto natif). Le serveur
// ne voit jamais que les sorties chiffrees de ces fonctions.
//
// On n'invente AUCUNE primitive : on assemble Web Crypto.
//   - Identite utilisateur : paire ECDH P-256 (sert a wrapper/deballer les cles
//     de coffre qui lui sont destinees).
//   - Cle de coffre : AES-256-GCM (chiffre les secrets du coffre).
//   - Deverrouillage : une cle d'enrobage derivee soit d'un mot de passe maitre
//     (PBKDF2), soit de la sortie PRF d'une passkey (HKDF) ; elle (de)wrappe la
//     cle privee de l'utilisateur. Le modele est agnostique a la methode : la
//     cle privee est stockee wrappee, une fois par methode.
//   - Partage : on wrappe la cle d'un coffre VERS la cle publique d'un membre
//     facon ECIES (ECDH ephemere + HKDF + AES-GCM), pour que seul le destinataire
//     (avec SA cle privee) puisse la deballer.
//
// Regles : IV aleatoire et unique a chaque chiffrement (jamais reutilise) ;
// cles extractables uniquement quand on doit les exporter pour les wrapper.

const subtle = globalThis.crypto.subtle;

// Les API Web Crypto exigent des vues adossees a un ArrayBuffer (pas SharedArrayBuffer) :
// on type explicitement nos octets ainsi, sinon TS rejette (Uint8Array<ArrayBufferLike>).
type Bytes = Uint8Array<ArrayBuffer>;

/** Version du format crypto, stockee avec chaque blob (agilite : migrations futures). */
export const CRYPTO_VERSION = 1;

/** Iterations PBKDF2 pour le chemin mot de passe maitre (OWASP >= 600k). */
export const PBKDF2_ITERATIONS = 600_000;

const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };
const AES_BITS = 256;
const IV_LENGTH = 12; // AES-GCM : 96 bits recommandes

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Un blob chiffre symetrique : IV + texte chiffre (le tag GCM est inclus). */
export interface BlobChiffre {
  iv: Bytes;
  ciphertext: Bytes;
}

/** Cle de coffre wrappee vers un destinataire (ECIES) : il faut la cle publique
 *  ephemere pour la deballer cote destinataire. */
export interface CleEnrobeeDestinataire {
  ephemeralPublicKey: Bytes;
  iv: Bytes;
  ciphertext: Bytes;
}

// --- Identite utilisateur (ECDH P-256) ------------------------------------

/** Genere la paire d'identite de l'utilisateur. Cle privee extractable : on doit
 *  pouvoir l'exporter pour la wrapper avant stockage. */
export function generateIdentityKeypair(): Promise<CryptoKeyPair> {
  return subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle.exportKey("spki", key));
}

export function importPublicKey(bytes: Bytes): Promise<CryptoKey> {
  return subtle.importKey("spki", bytes, ECDH_PARAMS, true, []);
}

async function exportPrivateKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle.exportKey("pkcs8", key));
}

function importPrivateKey(bytes: Bytes): Promise<CryptoKey> {
  return subtle.importKey("pkcs8", bytes, ECDH_PARAMS, true, ["deriveBits"]);
}

// --- Cle de coffre (AES-256-GCM) ------------------------------------------

export function generateVaultKey(): Promise<CryptoKey> {
  return subtle.generateKey({ name: "AES-GCM", length: AES_BITS }, true, ["encrypt", "decrypt"]);
}

export async function exportRawKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle.exportKey("raw", key));
}

export function importVaultKey(raw: Bytes): Promise<CryptoKey> {
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

// --- Chiffrement des secrets ----------------------------------------------

function randomIv(): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/** Chiffre des octets avec une cle AES-GCM. IV aleatoire neuf a chaque appel. */
export async function encryptBytes(key: CryptoKey, plaintext: Bytes): Promise<BlobChiffre> {
  const iv = randomIv();
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return { iv, ciphertext };
}

export async function decryptBytes(key: CryptoKey, blob: BlobChiffre): Promise<Bytes> {
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: blob.iv }, key, blob.ciphertext));
}

/** Chiffre un objet JSON (titre, url, login, mot de passe, notes) en un blob. */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<BlobChiffre> {
  return encryptBytes(key, enc.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, blob: BlobChiffre): Promise<T> {
  return JSON.parse(dec.decode(await decryptBytes(key, blob))) as T;
}

// --- Cle d'enrobage (deverrouillage) --------------------------------------

/** Derive la cle d'enrobage depuis le mot de passe maitre (PBKDF2-SHA256). */
export async function deriveUnlockKeyFromPassword(
  password: string,
  salt: Bytes,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: AES_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Derive la cle d'enrobage depuis la sortie PRF d'une passkey (HKDF-SHA256).
 *  `prfOutput` = les ~32 octets remis par l'authenticator (extension PRF). */
export async function deriveUnlockKeyFromPrf(prfOutput: Bytes): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("coffre-real31:unlock:v1") },
    base,
    { name: "AES-GCM", length: AES_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

// --- Wrap / unwrap de la cle privee par une cle d'enrobage ----------------

/** Wrappe la cle privee de l'utilisateur avec une cle d'enrobage (stockage). */
export async function wrapPrivateKey(unlockKey: CryptoKey, privateKey: CryptoKey): Promise<BlobChiffre> {
  return encryptBytes(unlockKey, await exportPrivateKey(privateKey));
}

/** Deballe la cle privee. Echoue (exception GCM) si la cle d'enrobage est fausse
 *  (mauvais mot de passe / mauvaise passkey). */
export async function unwrapPrivateKey(unlockKey: CryptoKey, blob: BlobChiffre): Promise<CryptoKey> {
  return importPrivateKey(await decryptBytes(unlockKey, blob));
}

// --- Partage : wrap d'une cle de coffre vers un destinataire (ECIES) -------

/** Derive une cle AES-GCM a partir d'un secret partage ECDH, via HKDF. */
async function aesFromSharedBits(bits: ArrayBuffer): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", new Uint8Array(bits), "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("coffre-real31:vault-key-wrap:v1") },
    base,
    { name: "AES-GCM", length: AES_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Wrappe une cle de coffre (octets bruts) VERS la cle publique d'un membre.
 *  ECDH ephemere : seul le destinataire (avec sa cle privee) pourra deballer. */
export async function wrapKeyForRecipient(
  recipientPublicKey: CryptoKey,
  vaultKeyRaw: Bytes,
): Promise<CleEnrobeeDestinataire> {
  const ephemeral = await subtle.generateKey(ECDH_PARAMS, false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "ECDH", public: recipientPublicKey }, ephemeral.privateKey, AES_BITS);
  const wrappingKey = await aesFromSharedBits(bits);
  const { iv, ciphertext } = await encryptBytes(wrappingKey, vaultKeyRaw);
  return { ephemeralPublicKey: await exportPublicKey(ephemeral.publicKey), iv, ciphertext };
}

/** Deballe une cle de coffre recue, avec la cle privee du destinataire. */
export async function unwrapKeyFromSender(
  recipientPrivateKey: CryptoKey,
  enrobee: CleEnrobeeDestinataire,
): Promise<Bytes> {
  const ephemeralPublic = await importPublicKey(enrobee.ephemeralPublicKey);
  const bits = await subtle.deriveBits({ name: "ECDH", public: ephemeralPublic }, recipientPrivateKey, AES_BITS);
  const wrappingKey = await aesFromSharedBits(bits);
  return decryptBytes(wrappingKey, { iv: enrobee.iv, ciphertext: enrobee.ciphertext });
}

// --- Base64 (stockage des blobs en base / transport) ----------------------

export function toBase64(bytes: Bytes): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return globalThis.btoa(binary);
}

export function fromBase64(b64: string): Bytes {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Genere un sel aleatoire (PBKDF2, etc.). */
export function randomSalt(length = 16): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
