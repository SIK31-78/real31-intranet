// Port de la reformulation d'un mail par un modèle de langue (28/10/2026, ADR-051). Le domaine
// (domain/reformulation.ts) écrit les consignes et le message, et contrôle ce qui revient ;
// l'adapter ne fait que l'appel. Aucun outil n'est donné au modèle : texte en entrée, texte
// en sortie.

export interface DemandeReformulation {
  /** Les consignes (rôle system). */
  systeme: string;
  /** Le contexte et le brouillon encapsulé (rôle user). */
  message: string;
  modele: string;
  maxTokens: number;
  /** Au-delà, l'appel est abandonné (ErreurReformulation « delai »). */
  delaiMs: number;
}

/** Comment l'appel s'est terminé : texte complet, coupé par max_tokens, ou refusé par le modèle. */
export type FinReformulation = "termine" | "coupe" | "refus";

export interface ReponseReformulation {
  texte: string;
  fin: FinReformulation;
  tokensEntree: number;
  tokensSortie: number;
  /** Le modèle qui a réellement répondu (un repli en cas de refus peut en changer). */
  modele: string;
}

/** Pourquoi l'appel n'a pas abouti, sans aucun contenu du mail. */
export type CodeErreurReformulation = "delai" | "credit" | "saturation" | "configuration" | "api";

export class ErreurReformulation extends Error {
  constructor(
    readonly code: CodeErreurReformulation,
    message: string,
  ) {
    super(message);
    this.name = "ErreurReformulation";
  }
}

export interface ReformulationProvider {
  /** Nom court pour le journal et les traces (« anthropic », « mock »). */
  readonly nom: string;
  reformuler(demande: DemandeReformulation): Promise<ReponseReformulation>;
}
