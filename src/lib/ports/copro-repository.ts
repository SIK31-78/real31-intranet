// Port (contrat) du referentiel copropriete.
// Source reelle a terme : App A (public.Copropriete), lue via un adapter.
// Ne depend que du domaine.

import type { Copropriete } from "@/lib/domain/copropriete";

export interface CoproRepository {
  /** Liste les copros du portefeuille (scope gestionnaire applique cote source). */
  list(): Promise<Copropriete[]>;
  /** Renvoie la copro par son code, ou null si introuvable / hors scope. */
  findByCode(code: string): Promise<Copropriete | null>;
}
