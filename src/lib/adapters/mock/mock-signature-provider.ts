// Adapter mock du port de signature : une signature HTML cannee, pour tester le
// rendu dans le cockpit sans cle Signitic.

import type { SignatureProvider } from "@/lib/ports/signature-provider";

export class MockSignatureProvider implements SignatureProvider {
  async getSignatureHtml(email: string): Promise<string | null> {
    const nom = (email.split("@")[0] ?? "Gestionnaire").replace(/[._]/g, " ");
    return (
      `<table style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;border-collapse:collapse">` +
      `<tr><td style="padding-right:12px;border-right:3px solid #0a7">` +
      `<strong style="font-size:14px">${nom}</strong><br/>` +
      `<span style="color:#555">REAL31 - Gestionnaire de copropriete</span><br/>` +
      `<span style="color:#0a7">www.real31.fr</span>` +
      `</td></tr></table>`
    );
  }
}
