// Port (contrat) d'extraction du GRAND LIVRE comptable de l'ancien syndic. Abstrait le
// moteur IA (Claude / Claude CLI / Mistral) exactement comme le port d'extraction du
// patrimoine : le service d'orchestration ne connait que ce contrat, jamais un adapter.
//
// Une SEULE mission : lire le PDF du grand livre (mise en page propre a chaque syndic) et
// en sortir des ecritures structurees. Le montage de la balance et l'auto-check d'equilibre
// sont du code deterministe (domain/ecriture.ts), PAS un appel IA.
//
// On reutilise le type DocumentSource du port d'extraction patrimoine (meme notion de PDF
// source) plutot que de le redefinir : un port peut dependre d'un autre port.

import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";

export interface ExtractionComptaProvider {
  /** Lit le(s) PDF du grand livre et reconstitue TOUTES les ecritures (hors reports/totaux). */
  extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures>;
}
