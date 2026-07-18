// Secrets de la fiche de renseignements : generation + hashage. Server-only (node:crypto).
// On ne stocke JAMAIS les secrets en clair : uniquement leur SHA-256 (hex). Le token vit dans
// le lien du courrier ; le code personnel est imprime a cote. La comparaison cote serveur se
// fait en temps constant (timingSafeEqual) pour ne pas fuiter d'info par le temps de reponse.

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/** Token secret du lien : 256 bits (>= 128 exige), base64url (URL-safe, ~43 car). */
export function genererToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Code personnel imprime : court, saisi a la main. 8 caracteres Crockford base32 (sans
 * I/L/O/U pour eviter les confusions), tire de 5 octets aleatoires (~40 bits). C'est un
 * SECOND facteur : combine au token (256 bits), il ferme l'enumeration meme si un lien fuite.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export function genererCode(): string {
  const octets = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[octets[i] % ALPHABET.length];
  return code;
}

/** SHA-256 hex d'un secret (token ou code normalise). */
export function hacher(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Normalise un code saisi : majuscules, sans espaces/tirets (tolerance de saisie). */
export function normaliserCode(saisi: string): string {
  return saisi.toUpperCase().replace(/[\s-]/g, "");
}

/** Compare deux hash hex en temps constant (anti timing attack). */
export function hashEgal(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
