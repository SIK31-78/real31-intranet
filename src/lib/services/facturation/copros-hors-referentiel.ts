// Copros ESTALE absentes du referentiel, donc jamais facturees en gestion courante (REA-407).
// Affiche sur l'ecran Gestion courante et, pour ceux qui facturent, a l'accueil.
//
// La liste ESTALE vient du cache partage (24 h) : pas d'appel ESTALE de plus la plupart du
// temps. Ne leve jamais : ESTALE ou la base indisponible -> `controle: false`, que l'ecran
// de facturation dit, et que l'accueil tait.

import { getCoproRepository } from "@/lib/adapters/router";
import { coprosHorsReferentiel, type CoproHorsReferentiel } from "@/lib/domain/facturation/hors-referentiel";

export interface EtatHorsReferentiel {
  copros: CoproHorsReferentiel[];
  /** false = le controle n'a pas pu se faire (ESTALE non branche ou en panne, base KO). */
  controle: boolean;
}

/** Pour qui n'a pas a voir l'alerte : rien a afficher, sans requete. */
export const PAS_DE_CONTROLE: EtatHorsReferentiel = { copros: [], controle: false };

export async function listerCoprosHorsReferentiel(): Promise<EtatHorsReferentiel> {
  try {
    const repo = getCoproRepository();
    const [estale, references] = await Promise.all([repo.listerCoprosEstale(), repo.listerReferences()]);
    if (!estale) return { copros: [], controle: false };
    return { copros: coprosHorsReferentiel(estale, references), controle: true };
  } catch (err) {
    console.warn("[hors-referentiel] controle impossible :", (err as Error).message);
    return { copros: [], controle: false };
  }
}
