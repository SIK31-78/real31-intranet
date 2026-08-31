// Domaine PUR de l'historique d'edition de l'ODJ (Ctrl+Z / Ctrl+Y). Une pile de
// gestes {champId, avant, apres} : annuler resaisit `avant`, refaire resaisit
// `apres` - toujours via le MEME chemin de sauvegarde que la frappe (l'historique
// ne contourne jamais l'auto-save). Toute nouvelle frappe vide la pile de refaire
// (comportement standard des editeurs).

export interface GesteOdj {
  champId: string;
  /** Valeur AVANT le geste ("" = la valeur auto / champ vide). */
  avant: string;
  /** Valeur APRES le geste. */
  apres: string;
}

export interface HistoriqueOdj {
  annulables: GesteOdj[];
  refaisables: GesteOdj[];
}

export const HISTORIQUE_VIDE: HistoriqueOdj = { annulables: [], refaisables: [] };

/** Borne memoire : au-dela, les gestes les plus anciens tombent. */
const MAX_GESTES = 100;

/** Un geste d'edition vient d'etre commis : empile, et invalide les refaisables. */
export function pousserGeste(h: HistoriqueOdj, geste: GesteOdj): HistoriqueOdj {
  if (geste.avant === geste.apres) return h; // rien ne change, rien a annuler
  return {
    annulables: [...h.annulables.slice(-(MAX_GESTES - 1)), geste],
    refaisables: [],
  };
}

/** Ctrl+Z : rend le geste a defaire (resaisir `avant`), le bascule en refaisable. */
export function annuler(h: HistoriqueOdj): { historique: HistoriqueOdj; geste?: GesteOdj } {
  const geste = h.annulables[h.annulables.length - 1];
  if (!geste) return { historique: h };
  return {
    historique: {
      annulables: h.annulables.slice(0, -1),
      refaisables: [...h.refaisables, geste],
    },
    geste,
  };
}

/** Ctrl+Y : rend le geste a rejouer (resaisir `apres`), le rebascule en annulable. */
export function refaire(h: HistoriqueOdj): { historique: HistoriqueOdj; geste?: GesteOdj } {
  const geste = h.refaisables[h.refaisables.length - 1];
  if (!geste) return { historique: h };
  return {
    historique: {
      annulables: [...h.annulables, geste],
      refaisables: h.refaisables.slice(0, -1),
    },
    geste,
  };
}
