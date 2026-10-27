// Referentiel du tri d'une boite : ESTALE + copros Crypto de l'intranet, fusionnes
// (domaine : fusionnerReferentiels). Une source qui ne repond pas n'empeche pas l'autre :
// l'ecran l'annonce par un avertissement.
//
// Perimetre (V2 du 27/10/2026) : les AGENCES de la boite. C'est l'UNION des copros Crypto de
// ces agences et des copros ESTALE dont l'etablissement y correspond (« REAL 31 - LGC » ->
// LGC) : une copro ESTALE pas encore dans l'intranet reste proposee. Une source en panne
// garde l'autre, toujours bornee aux agences ; jamais « pas de filtre » (avant, sans agence
// fixee, tout le parc passait).

import { cleDeReference, fusionnerReferentiels, type ReferentielTri } from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";

export class ReferentielTriBoite implements ReferentielTriProvider {
  private readonly agences: Set<string>;

  constructor(
    private readonly estale: ReferentielTriProvider | null,
    private readonly crypto: ReferentielTriProvider,
    agences: readonly string[],
  ) {
    this.agences = new Set(agences.map((a) => a.trim().toUpperCase()).filter(Boolean));
  }

  async charger(): Promise<ReferentielTri> {
    if (this.agences.size === 0) {
      return { copros: [], expediteurs: {}, avertissements: ["Aucune agence n'est rattachée à cette boîte : aucune copropriété n'est proposée."] };
    }
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
    const estale = e.status === "fulfilled" ? e.value : null;
    const perimetre = new Set<string>();
    const ajouter = (reference: string) => {
      const cle = cleDeReference(reference);
      if (cle !== null) perimetre.add(cle);
    };
    // Crypto est deja lu pour les seules agences de la boite.
    for (const x of crypto?.copros ?? []) ajouter(x.reference);
    // ESTALE : l'agence de l'etablissement. Une copro ESTALE sans etablissement lisible n'entre
    // que par sa fiche Crypto.
    for (const x of estale?.copros ?? []) if (x.agence && this.agences.has(x.agence.toUpperCase())) ajouter(x.reference);
    const ref = fusionnerReferentiels(estale, crypto, perimetre);
    return { ...ref, avertissements: [...avertissements, ...(ref.avertissements ?? [])] };
  }
}
