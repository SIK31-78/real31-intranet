// Port (contrat) des gestionnaires. Source reelle : public."User" (App A), via les
// managerId references par public."Copropriete". Ne depend que du domaine.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";

export interface GestionnaireRepository {
  /** Gestionnaires reels (Users qui gerent au moins une copro). */
  list(): Promise<Gestionnaire[]>;
  /**
   * Profils INCARNABLES via le selecteur dev-login. Sert UNIQUEMENT a l'impersonation :
   * `list()` reste la liste des collaborateurs a portefeuille (AG, filtres).
   */
  /** Profils incarnables au dev-login : tout le cabinet encore present (vente et location compris). */
  listImpersonables(): Promise<Gestionnaire[]>;
  /**
   * TOUS les collaborateurs du cabinet (public."User"), quel que soit le role ou le
   * portefeuille : sert a ASSIGNER une tache (reprise de copro) a n'importe qui —
   * une assistante sans copro, un admin, un directeur. Trie par nom.
   */
  listTous(): Promise<Gestionnaire[]>;
  findById(id: string): Promise<Gestionnaire | null>;
  /** Resout un gestionnaire par email (SSO Entra ID -> public."User"). */
  findByEmail(email: string): Promise<Gestionnaire | null>;
}
