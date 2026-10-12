// Referentiel du tri d'une boite : ESTALE + copros Crypto de l'intranet, fusionnes
// (domaine : fusionnerReferentiels). Une source qui ne repond pas n'empeche pas l'autre :
// l'ecran l'annonce par un avertissement. Quand l'agence est fixee (MAIL_TRI_AGENCE), les
// copros Crypto de l'agence bornent aussi les copros ESTALE retenues.

import { cleDeReference, fusionnerReferentiels, type ReferentielTri } from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";

export class ReferentielTriBoite implements ReferentielTriProvider {
  constructor(
    private readonly estale: ReferentielTriProvider | null,
    private readonly crypto: ReferentielTriProvider,
    private readonly agenceFixee: boolean,
  ) {}

  async charger(): Promise<ReferentielTri> {
    const [e, c] = await Promise.allSettled([this.estale ? this.estale.charger() : Promise.resolve(null), this.crypto.charger()]);
    if (e.status === "rejected" && c.status === "rejected") throw e.reason;
    const avertissements: string[] = [];
    if (e.status === "rejected") {
      avertissements.push("ESTALE n'a pas répondu : seules les copropriétés Crypto sont proposées.");
      console.error("[tri-emails] referentiel ESTALE :", e.reason instanceof Error ? e.reason.message : e.reason);
    }
    if (c.status === "rejected") {
      avertissements.push("Le référentiel des copropriétés Crypto est indisponible : seules les copropriétés ESTALE sont proposées.");
      console.error("[tri-emails] referentiel Crypto :", c.reason instanceof Error ? c.reason.message : c.reason);
    }
    const crypto = c.status === "fulfilled" ? c.value : null;
    const perimetre =
      this.agenceFixee && crypto
        ? new Set(crypto.copros.map((x) => cleDeReference(x.reference)).filter((k): k is string => k !== null))
        : null;
    const ref = fusionnerReferentiels(e.status === "fulfilled" ? e.value : null, crypto, perimetre);
    return { ...ref, avertissements: [...avertissements, ...(ref.avertissements ?? [])] };
  }
}
