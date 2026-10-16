// Le journal du module « Contrats & contrôles », côté écriture (REA-333). Un seul point
// d'entrée pour tous les services : `journaliser` ne LÈVE JAMAIS. Un geste déjà écrit en base
// (étape datée, cycle clos, offre saisie) ne se défait pas parce que la table du journal
// manque ou tousse : on prévient (console.warn + Sentry) et on rend la main.
//
// Le contenu attendu de `details` par type est documenté en tête de
// src/lib/domain/contrats-copro/journal.ts : c'est ce que `texteJournal` sait lire.

import { getContratsCoproRepository } from "@/lib/adapters/router";
import type { NouvelleEntreeJournal } from "@/lib/domain/contrats-copro";
import { signalerException } from "@/lib/observabilite";

/** Ajoute une entrée au journal ; une panne du journal est signalée, jamais remontée. */
export async function journaliser(e: NouvelleEntreeJournal): Promise<void> {
  try {
    await getContratsCoproRepository().ajouterJournal(e);
  } catch (err) {
    console.warn(`[contrats-copro] journal indisponible (${e.type}, ${e.coproCode}) :`, err instanceof Error ? err.message : err);
    signalerException(err, { source: "contrats-copro-journal", copro: e.coproCode, detail: { type: e.type, cycleId: e.cycleId } });
  }
}
