// Port (contrat) d'extraction du GRAND LIVRE comptable de l'ancien syndic : le service
// d'orchestration ne connait que ce contrat, jamais un adapter (ADR-001).
//
// Une SEULE mission : lire le PDF du grand livre (mise en page propre a chaque syndic) et
// en sortir des ecritures structurees. Le montage de la balance et les auto-checks
// d'equilibre sont du code deterministe (domain/ecriture.ts). Le seul adapter du repo est
// la COUCHE TEXTE (deterministe) ; les adapters IA ont ete supprimes (refonte 2026-08).

import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";

export interface ExtractionComptaProvider {
  /** Lit le(s) PDF du grand livre et reconstitue TOUTES les ecritures (hors reports/totaux). */
  extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures>;
}
