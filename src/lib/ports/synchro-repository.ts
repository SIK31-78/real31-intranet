// Port : compte rendu des synchros qui tournent hors de l'intranet (table intranet_synchro).
// L'intranet ne fait que le lire ; c'est le script de synchro qui l'ecrit.

import type { EtatSynchro } from "@/lib/domain/synchro";

export interface SynchroRepository {
  /** null = jamais passee (ou table absente). */
  etat(cle: string): Promise<EtatSynchro | null>;
}
