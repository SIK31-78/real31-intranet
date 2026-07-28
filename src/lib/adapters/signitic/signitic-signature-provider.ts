// Adapter Signitic du port de signature. Core API : base https://api.signitic.app,
// auth par header x-api-key, signature par email : GET /signatures/{email}/html.
// Cle SIGNITIC_API_KEY. Degrade proprement (null) si cle absente / erreur / 404.
//
// Cache module par email (TTL 15 min) : la signature est refetchee a CHAQUE envoi de
// mail alors qu'elle ne change presque jamais. On ne met en cache que les succes
// (une erreur transitoire doit pouvoir se retenter a l'envoi suivant).

import type { SignatureProvider } from "@/lib/ports/signature-provider";

const BASE = process.env.SIGNITIC_BASE_URL || "https://api.signitic.app";
// Timeout court : la signature est un CONFORT (l'envoi part sans elle) -> degrader vite.
const TIMEOUT_MS = Number(process.env.SIGNITIC_TIMEOUT_MS) || 10_000;

const TTL_MS = 15 * 60 * 1000;
const cacheSignatures = new Map<string, { html: string; expire: number }>();

export class SigniticSignatureProvider implements SignatureProvider {
  async getSignatureHtml(email: string): Promise<string | null> {
    const key = process.env.SIGNITIC_API_KEY;
    if (!key || !email) return null;
    const hit = cacheSignatures.get(email);
    if (hit && Date.now() < hit.expire) return hit.html;
    try {
      const r = await fetch(`${BASE}/signatures/${encodeURIComponent(email)}/html`, {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Trace DISCRETE et sans PII (statut HTTP seul, jamais l'email) : la degradation
      // est volontaire (le mail part sans signature, c'est un confort), mais elle etait
      // TOTALEMENT muette -- "la signature n'est pas passee" (Sekou, 2026-07-28) ne
      // laissait aucun moyen de distinguer une cle invalide (401/403) d'une signature
      // inexistante (404) sans rejouer l'appel a la main.
      if (!r.ok) {
        console.warn(`[signitic] signature non recuperee : HTTP ${r.status} (mail envoye sans signature)`);
        return null;
      }
      const html = (await r.text()).trim();
      if (!html) {
        console.warn("[signitic] signature vide renvoyee par l'API (mail envoye sans signature)");
        return null;
      }
      cacheSignatures.set(email, { html, expire: Date.now() + TTL_MS });
      return html;
    } catch (e) {
      // Timeout / reseau. Le nom de l'erreur suffit a distinguer un AbortError d'un DNS.
      console.warn(`[signitic] signature injoignable (${(e as Error).name}) : mail envoye sans signature`);
      return null;
    }
  }
}
