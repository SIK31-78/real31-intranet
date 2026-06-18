// Port (contrat) du pole compta. Notes : table native intranet_compta_notes.
// Flags : intranet_odj_champs (cle/valeur). Ne depend que du domaine.

import type { AuteurNote, EtatCompta } from "@/lib/domain/compta";

export type FlagCompta = "verifies" | "envoyer-avant";

export interface ComptaRepository {
  /** Etat compta (flags + fil de notes) pour une copro + AG. */
  getEtat(coproCode: string, agDateISO: string): Promise<EtatCompta>;
  /** Ajoute une note au fil. */
  ajouterNote(
    coproCode: string,
    agDateISO: string,
    auteur: AuteurNote,
    texte: string,
    par: string,
  ): Promise<void>;
  /** Marque une note resolue / non resolue. */
  marquerNote(noteId: string, resolu: boolean, par: string): Promise<void>;
  /** Pose / retire un flag (comptes verifies, envoyer avant). */
  setFlag(coproCode: string, agDateISO: string, flag: FlagCompta, valeur: boolean, par: string): Promise<void>;
  /** Etats compta de plusieurs AG d'un coup (pour la file comptable). */
  getEtats(cles: { coproCode: string; agDateISO: string }[]): Promise<Map<string, EtatCompta>>;
}
