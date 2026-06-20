// Service de la bibliotheque de resolutions (ADR-024). Lit la motion bank du cabinet
// via le routeur (jamais un adapter en direct, ADR-001). Degrade proprement si Estale
// tombe : on renvoie une liste vide + un drapeau, pas d'exception qui crashe la page.

import type { Resolution } from "@/lib/domain/resolution";
import { getBibliothequeResolutions } from "@/lib/adapters/router";

export interface BibliothequeData {
  resolutions: Resolution[];
  /** Vrai si la lecture Estale a echoue (panne / timeout). */
  indisponible: boolean;
}

export async function getBibliotheque(): Promise<BibliothequeData> {
  try {
    const resolutions = await getBibliothequeResolutions().listerCabinet();
    return { resolutions, indisponible: false };
  } catch (err) {
    console.warn("[resolutions] bibliotheque Estale indisponible :", (err as Error).message);
    return { resolutions: [], indisponible: true };
  }
}
