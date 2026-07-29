// Port (contrat) des gestionnaires. Source reelle : public."User" (App A), via les
// managerId references par public."Copropriete". Ne depend que du domaine.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";

export interface GestionnaireRepository {
  /** Gestionnaires reels (Users qui gerent au moins une copro). */
  list(): Promise<Gestionnaire[]>;
  /**
   * Profils INCARNABLES via le selecteur dev-login : les gestionnaires/assistants de
   * copros (`list()`) UNION les Users role=COMPTABLE (transverses, sans portefeuille,
   * donc absents de `list()`). Deduplique par id, trie par nom. Sert UNIQUEMENT a
   * l'impersonation : `list()` reste la liste des collaborateurs a portefeuille (AG,
   * filtres) et ne doit pas contenir les comptables.
   */
  /** Profils incarnables au dev-login : gestionnaires/assistants de copros + comptables. */
  listImpersonables(): Promise<Gestionnaire[]>;
  findById(id: string): Promise<Gestionnaire | null>;
  /** Resout un gestionnaire par email (SSO Entra ID -> public."User"). */
  findByEmail(email: string): Promise<Gestionnaire | null>;
}
