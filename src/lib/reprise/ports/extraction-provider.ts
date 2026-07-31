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

/** Total de tantiemes IMPRIME par la source pour un owner (contre-preuve, etape 4). */
export interface TotalImprimeExtrait {
  ownerId: string;
  total: number;
}

/** Un votant du PV avec ses voix (filet noms, etape 7). */
export interface VotantExtrait {
  nom: string;
  prenom?: string;
  tantiemes: number;
}

/** Sortie de l'Agent 2 : copropriétaires + attributions (owners deja dedupliques au mieux). */
export interface ResultatProprietaires {
  owners: Owner[];
  attributions: Attribution[];
  /**
   * « Nombre de tantiemes : X » imprime par la FDP en face de chaque coproprietaire. C'est la
   * CONTRE-PREUVE des attributions (etape 4) : elle localise l'erreur par personne, la ou les
   * auto-checks ne constatent que des orphelins en fin de course. Absent = non controle,
   * jamais une erreur.
   */
  totauxImprimes?: TotalImprimeExtrait[];
  /**
   * Votants du PV avec leurs voix. DEUXIEME SOURCE des patronymes (etape 7) : c'est le seul
   * moyen de detecter une coquille de transcription, qu'aucun controle arithmetique ne voit.
   */
  votants?: VotantExtrait[];
  /** Points de vigilance (SCI sans K-bis, scrutateur != EDD, fusions proposees...). */
  notes: string[];
}

export interface ExtractionProvider {
  /** Agent 1 - lit RCP/EDD/modificatifs, reconstitue l'EDD final. */
  extrairePatrimoine(docs: DocumentSource[]): Promise<ResultatPatrimoine>;
  /** Agent 2 - lit feuille de presence + PV + listes copropriétaires. */
  extraireProprietaires(docs: DocumentSource[]): Promise<ResultatProprietaires>;
}
