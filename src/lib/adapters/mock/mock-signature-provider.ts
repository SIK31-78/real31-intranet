// Adapter mock du port de signature : une signature HTML cannee, pour tester le
// rendu dans le cockpit sans cle Signitic.

import type { ProfilSignature, SignatureProvider } from "@/lib/ports/signature-provider";

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

  /** Prénom et nom tirés de l'email (prenom.nom@...), SANS ligne directe : un numéro
   *  inventé pourrait partir dans un vrai brouillon ESTALE (mieux vaut aucune ligne
   *  qu'une fausse, cf. SansSignatureProvider). */
  async getProfil(email: string): Promise<ProfilSignature | null> {
    const [prenom, ...reste] = (email.split("@")[0] ?? "").split(/[._]/).filter(Boolean);
    if (!prenom) return null;
    const maj = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
    return { prenom: maj(prenom), nom: reste.map(maj).join(" ") };
  }
}
