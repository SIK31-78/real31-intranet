// Port (contrat) des gestionnaires. Source reelle : public."User" (App A), via les
// managerId references par public."Copropriete". Ne depend que du domaine.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";

export interface GestionnaireRepository {
  /** Gestionnaires reels (Users qui gerent au moins une copro). */
  list(): Promise<Gestionnaire[]>;
  findById(id: string): Promise<Gestionnaire | null>;
  /** Resout un gestionnaire par email (SSO Entra ID -> public."User"). */
  findByEmail(email: string): Promise<Gestionnaire | null>;
}
