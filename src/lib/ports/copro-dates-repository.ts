// Port (contrat) des dates d'AG/CS des copros eStale. Source reelle : table native
// public.intranet_copro_dates (une ligne par copro eStale). Raison d'etre : eStale ne
// porte PAS les dates d'AG/CS planifiees (aucune AG tenue), et on ne peut pas ecrire ces
// dates dans le miroir Crypto (les 3 copros eStale orphelines n'y ont pas de ligne). Ne
// depend que du domaine.

import type { CoproDates } from "@/lib/domain/copro-fusion";

export interface CoproDatesRepository {
  /** Dates d'une copro eStale, ou null si aucune ligne (degrade en null si table absente). */
  lire(code: string): Promise<CoproDates | null>;
  /** Toutes les dates connues, indexees par code copro (pour un listing sans N+1). */
  lireToutes(): Promise<Map<string, CoproDates>>;
  /** Pose/efface une date (null = effacer). `quand` choisit prochaine (planifiee) ou
   *  derniere (tenue). Ecrit une seule colonne, upsert par code. */
  ecrire(
    code: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
  ): Promise<void>;
}
