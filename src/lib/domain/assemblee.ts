// Domaine de l'AG eStale (le "Meeting" et ses motions reelles). Source = eStale
// (ADR-024). Types purs. Sert au mode CS pour afficher/editer l'ODJ reel d'une AG.

import type { MajoriteResolution } from "@/lib/domain/resolution";

/** Une motion (resolution) telle qu'elle existe dans l'AG eStale. */
export interface MotionAg {
  /** Id eStale de la motion (cle pour edition/suppression a venir). */
  id: string;
  titre: string;
  majorite: MajoriteResolution;
  /** Cle de repartition (nom), ex "Charges communes generales". */
  cleRepartition?: string;
}

/** L'AG eStale d'une copro + ses motions, dans l'ordre. */
export interface AssembleeAg {
  meetingId: string;
  nom: string;
  /** Date de l'AG (ISO), si fixee. */
  dateISO?: string;
  motions: MotionAg[];
}
