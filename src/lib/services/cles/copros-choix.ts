// Les coproprietes proposees dans les formulaires du module cles : le referentiel du
// cabinet (actives), projete en { code, nom, adresse }. Memoise par rendu.

import { cache } from "react";
import { getCoproRepository } from "@/lib/adapters/router";

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
