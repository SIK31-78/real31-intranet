// Adapter Signitic du port de signature. Core API : base https://api.signitic.app,
// auth par header x-api-key, signature par email : GET /signatures/{email}/html.
// Cle SIGNITIC_API_KEY. Degrade proprement (null) si cle absente / erreur / 404.

import type { SignatureProvider } from "@/lib/ports/signature-provider";

const BASE = process.env.SIGNITIC_BASE_URL || "https://api.signitic.app";

export class SigniticSignatureProvider implements SignatureProvider {
  async getSignatureHtml(email: string): Promise<string | null> {
    const key = process.env.SIGNITIC_API_KEY;
    if (!key || !email) return null;
    try {
      const r = await fetch(`${BASE}/signatures/${encodeURIComponent(email)}/html`, {
        headers: { "x-api-key": key },
      });
      if (!r.ok) return null;
      const html = (await r.text()).trim();
      return html || null;
    } catch {
      return null;
    }
  }
}
