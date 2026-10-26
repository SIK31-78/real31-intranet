// Ce qu'un trousseau peut ouvrir, propose dans les formulaires du module cles : les
// coproprietes du referentiel (actives) et les biens hors syndic des agences (ADR-049).

import { cache } from "react";
import { getBienRepository, getCoproRepository } from "@/lib/adapters/router";
import { adresseEnLigne } from "@/lib/domain/bien";

export interface CoproChoixService {
  code: string;
  nom: string;
  adresse: string;
}

export const coprosPourCles = cache(async (): Promise<CoproChoixService[]> => {
  const copros = await getCoproRepository().listerToutes().catch(() => []);
  return copros
    .filter((c) => c.statut === "active")
    .map((c) => ({ code: c.code, nom: c.nom, adresse: [c.adresse?.ligne1, c.adresse?.ville].filter(Boolean).join(", ") }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
});

/** Un bien hors syndic proposable dans le formulaire (location ou vente, ADR-049). */
export interface BienChoixService {
  id: string;
  agenceCode: string;
  activite: "location" | "transaction";
  reference: string;
  /** Proprietaire, sinon nom d'usage : ce que l'agence tape pour le retrouver. */
  nom: string;
  adresse: string;
}

/** Les biens actifs des agences donnees, tries par reference. */
export async function biensPourCles(agences: readonly string[]): Promise<BienChoixService[]> {
  if (agences.length === 0) return [];
  const biens = await getBienRepository().lister().catch(() => []);
  const voulues = new Set(agences.map((a) => a.toUpperCase()));
  return biens
    .filter((b) => b.actif && voulues.has(b.agenceCode.toUpperCase()))
    .map((b) => ({
      id: b.id,
      agenceCode: b.agenceCode.toUpperCase(),
      activite: b.activite,
      reference: b.reference,
      nom: [b.proprietaire?.prenom, b.proprietaire?.nom].filter(Boolean).join(" ") || b.libelle,
      adresse: adresseEnLigne(b.adresse),
    }))
    .sort((a, b) => a.reference.localeCompare(b.reference, "fr", { numeric: true }));
}
