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
      if (!r.ok) return null;
      const html = (await r.text()).trim();
      if (!html) return null;
      cacheSignatures.set(email, { html, expire: Date.now() + TTL_MS });
      return html;
    } catch {
      return null;
    }
  }
}
