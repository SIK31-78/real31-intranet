// Domaine du tri de mail (porte depuis assistant-ia). Types purs partages par le
// pipeline (clean/prefilter/group/sender) et le port d'analyse. Ne depend que du
// domaine (la taxonomie TypeMail est deja definie dans mes-emails).

import type { TypeMail } from "@/lib/domain/mes-emails";

/** Mail normalise, issu de l'ingestion (Graph) ou d'un echantillon de test. */
export interface RawMail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  /** ISO 8601. */
  receivedAt: string;
  bodyText: string;
  /** Copropriete best-effort (dossier source ou extraction) ; "" si inconnue. */
  copro: string;
  attachments: { name: string; contentType?: string; sizeBytes?: number }[];
}

/** Les 10 types de tete (memes valeurs que TypeMail) pour la validation runtime. */
export const MAIL_TYPES: readonly TypeMail[] = [
  "panne_intervention",
  "sinistre_degat_eaux",
  "demande_copro_cs",
  "devis_validation",
  "facture_contrat_fournisseur",
  "comptabilite",
  "ag_cs",
  "vefa_reserves",
  "non_ticketable",
  "autre",
];

/** Sortie de l'etape de classification. */
export interface Classification {
  ticketable: boolean;
  type: TypeMail;
  est_nouveau_ticket: boolean;
  confidence: number;
  rationale: string;
}

/** Proposition de reponse + plan d'action. */
export interface PlanPropose {
  reponse: string;
  etapes: string[];
}
