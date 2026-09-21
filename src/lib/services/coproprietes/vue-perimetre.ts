// Service : quelles vues ce collaborateur peut choisir (ADR-041), et son libelle pour la
// vue « perimetre ». La lecture du cookie et l'action vivent cote app (lib/auth/vue-perimetre).

import { libelleVuePerimetre, vuesPermises, type VuePerimetre } from "@/lib/domain/perimetre-ecriture";
import { perimetreEcritureDe } from "@/lib/services/coproprietes/perimetre-ecriture";

export interface VuesDisponibles {
  vues: VuePerimetre[];
  libelles: Record<VuePerimetre, string>;
}

export async function vuesDisponibles(userId: string, superAdmin = false): Promise<VuesDisponibles> {
  const p = await perimetreEcritureDe(userId);
  const auteur = { ...(p?.auteur ?? { id: userId }), superAdmin };
  return {
    vues: p ? vuesPermises(auteur, p.delegations.length > 0) : ["portefeuille"],
    libelles: { portefeuille: "Mon portefeuille", perimetre: libelleVuePerimetre(auteur), cabinet: "Le cabinet" },
  };
}
