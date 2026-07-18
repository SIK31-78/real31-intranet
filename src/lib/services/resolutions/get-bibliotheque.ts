// Service de la bibliotheque de resolutions (ADR-024). Lit la motion bank du cabinet
// via le routeur (jamais un adapter en direct, ADR-001). Degrade proprement si Estale
// tombe : on renvoie une liste vide + un drapeau, pas d'exception qui crashe la page.
//
// La motion bank (109 resos cabinet) change rarement mais est lue live a chaque appel
// (page /resolutions ET composer, qui l'appellent tous les deux, cf ADR-002 pour le
// cache eStale des donnees copro). React.cache memoise l'appel POUR LA DUREE D'UN
// MEME RENDU SERVEUR (dedupe si getBibliotheque() est invoque plusieurs fois dans le
// meme rendu) ; ca ne persiste PAS entre requetes. Un vrai cache TTL partage (comme
// EstaleCacheStore, ADR-002) demanderait une table dediee (le store existant est cle
// par copro_code, pas adapte a une donnee globale cabinet) : hors scope de ce lot
// (pas de migration SQL ici).

import { cache } from "react";
import type { Resolution } from "@/lib/domain/resolution";
import { getBibliothequeResolutions } from "@/lib/adapters/router";

export interface BibliothequeData {
  resolutions: Resolution[];
  /** Vrai si la lecture Estale a echoue (panne / timeout). */
  indisponible: boolean;
}

export const getBibliotheque = cache(async (): Promise<BibliothequeData> => {
  try {
    const resolutions = await getBibliothequeResolutions().listerCabinet();
    return { resolutions, indisponible: false };
  } catch (err) {
    console.warn("[resolutions] bibliotheque Estale indisponible :", (err as Error).message);
    return { resolutions: [], indisponible: true };
  }
});
