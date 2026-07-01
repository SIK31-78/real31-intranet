// Port (contrat) des "sous-agents" d'extraction. Abstrait le moteur IA (Claude OU
// Mistral, cf. ADR a venir) : le service d'orchestration ne connait que ce contrat.
// Ne depend que du domaine.
//
// Decoupage fidele au protocole 3 sous-agents de la CLAUDE.md vault :
//   - extrairePatrimoine  = Agent 1 (RCP + modificatifs)  -> lots, cles, tantiemes
//   - extraireProprietaires = Agent 2 (FDP + PV)          -> owners, attributions
//   - Agent 3 (construction + auto-checks) n'est PAS ici : c'est du code deterministe
//     (domain/auto-checks.ts + adapters/xlsx), pas un appel IA.

import type { Attribution, Cle, Lot, Owner, Tantieme } from "@/lib/reprise/domain/patrimoine";

/** Un document source a analyser (PDF du syndic sortant). */
export interface DocumentSource {
  /** Nom de fichier d'origine (sert d'indice : "rcp.pdf", "feuille de presence.pdf"...). */
  nom: string;
  /** Octets du PDF. */
  contenu: Uint8Array;
  /** Type MIME (defaut application/pdf). */
  mime?: string;
}

/** Sortie de l'Agent 1 : structure de l'immeuble (lots + cles + tantiemes). */
export interface ResultatPatrimoine {
  lots: Lot[];
  cles: Cle[];
  tantiemes: Tantieme[];
  /** Points de vigilance remontes par l'extraction (modificatifs integres, EDD retenu...). */
  notes: string[];
}

/** Sortie de l'Agent 2 : copropriétaires + attributions (owners deja dedupliques au mieux). */
export interface ResultatProprietaires {
  owners: Owner[];
  attributions: Attribution[];
  /** Points de vigilance (SCI sans K-bis, scrutateur != EDD, fusions proposees...). */
  notes: string[];
}

export interface ExtractionProvider {
  /** Agent 1 - lit RCP/EDD/modificatifs, reconstitue l'EDD final. */
  extrairePatrimoine(docs: DocumentSource[]): Promise<ResultatPatrimoine>;
  /** Agent 2 - lit feuille de presence + PV + listes copropriétaires. */
  extraireProprietaires(docs: DocumentSource[]): Promise<ResultatProprietaires>;
}
