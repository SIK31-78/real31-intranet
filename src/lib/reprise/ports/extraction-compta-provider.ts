// Port (contrat) d'extraction des documents COMPTABLES de l'ancien syndic : le service
// d'orchestration ne connait que ce contrat, jamais un adapter (ADR-001).
//
// Deux missions : lire le PDF du GRAND LIVRE (mise en page propre a chaque syndic) et en
// sortir des ecritures structurees ; lire le PDF du RGD (releve general de depenses) et en
// sortir les lignes de depenses (TVA / deductible / recuperable, que le grand livre n'a
// pas). Le montage de la balance et les auto-checks d'equilibre sont du code deterministe
// (domain/ecriture.ts, domain/rgd.ts). Le seul adapter du repo est la COUCHE TEXTE
// (deterministe) ; les adapters IA ont ete supprimes (refonte 2026-08).

import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { JeuRgd } from "@/lib/reprise/domain/rgd";

export interface ExtractionComptaProvider {
  /** Lit le(s) PDF du grand livre et reconstitue TOUTES les ecritures (hors reports/totaux). */
  extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures>;
  /**
   * Lit le PDF du RGD du sortant et reconstitue ses lignes de depenses : la SEULE source des
   * colonnes TVA / Deductible / Recuperable de la classe 6 d'entries.xlsx, et la reference
   * des auto-checks compta n.8 (sommes TVA vs RGD) et n.9 (appariement RGD <-> GL).
   */
  extraireRgd(docs: DocumentSource[]): Promise<JeuRgd>;
}
