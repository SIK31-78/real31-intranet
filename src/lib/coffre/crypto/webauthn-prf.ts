// Ceremonie WebAuthn + extension PRF (ADR-025), cote navigateur uniquement.
//
// On n'utilise PAS la passkey comme facteur d'AUTHENTIFICATION (le SSO Entra
// authentifie deja) : on s'en sert UNIQUEMENT pour deriver un secret STABLE
// (sortie PRF, ~32 octets tenue par l'authenticator) qui sert de cle d'enrobage
// de la cle privee du coffre. D'ou : le challenge n'a pas besoin d'etre verifie
// cote serveur (il reste aleatoire, par hygiene). rpId = domaine courant ->
// marche sur localhost comme en prod sans config.

import { toBase64, fromBase64, randomSalt } from "./crypto-core";

const RP_NAME = "REAL31 Intranet";

/** Copie un BufferSource (sortie PRF) dans un Uint8Array adosse a un ArrayBuffer. */
function toBytes(src: BufferSource): Uint8Array<ArrayBuffer> {
  const view = ArrayBuffer.isView(src)
    ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
    : new Uint8Array(src);
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

function challenge(): Uint8Array<ArrayBuffer> {
  return randomSalt(32);
}

export interface PasskeyEnrolee {
  /** Id du credential (base64), pour redemander la meme passkey au deverrouillage. */
  credentialId: string;
  /** Sel d'evaluation PRF (base64), stable pour cet utilisateur. */
  salt: string;
  /** Sortie PRF brute (ne JAMAIS persister : elle derive la cle d'enrobage). */
  prfOutput: Uint8Array<ArrayBuffer>;
}

/** Cree une passkey (Windows Hello, Touch ID, cle...) avec PRF et en derive le
 *  premier secret. Throw si l'authenticator ne supporte pas PRF. */
export async function creerPasskeyPrf(
  userId: string,
  userName: string,
  displayName: string,
): Promise<PasskeyEnrolee> {
  const rpId = location.hostname;
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: RP_NAME, id: rpId },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName || displayName || "utilisateur",
        displayName: displayName || userName || "utilisateur",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      timeout: 60_000,
      extensions: { prf: {} },
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Creation de la passkey annulee.");

  const enabled = cred.getClientExtensionResults().prf?.enabled;
  if (!enabled) {
    throw new Error("Cet appareil ne supporte pas PRF : impossible d'en deriver une cle stable.");
  }

  const credentialId = toBase64(new Uint8Array(cred.rawId));
  const salt = randomSalt(32);
  const prfOutput = await evaluerPrf(credentialId, salt, rpId);
  return { credentialId, salt: toBase64(salt), prfOutput };
}

/** Re-evalue la PRF d'une passkey existante (au deverrouillage). */
export async function obtenirPrf(credentialId: string, saltB64: string): Promise<Uint8Array<ArrayBuffer>> {
  return evaluerPrf(credentialId, fromBase64(saltB64), location.hostname);
}

async function evaluerPrf(
  credentialId: string,
  salt: Uint8Array<ArrayBuffer>,
  rpId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      rpId,
      allowCredentials: [{ type: "public-key", id: fromBase64(credentialId) }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Deverrouillage par passkey annule.");

  const first = assertion.getClientExtensionResults().prf?.results?.first;
  if (!first) throw new Error("PRF indisponible sur cet appareil.");
  return toBytes(first);
}
