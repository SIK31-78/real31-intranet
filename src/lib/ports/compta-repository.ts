// Port (contrat) du pole compta. Notes : table native intranet_compta_notes.
// Flags : intranet_odj_champs (cle/valeur). Ne depend que du domaine.

import type { AuteurNote, EtatCompta, StatutPoste } from "@/lib/domain/compta";

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
  /** Marque une note resolue / non resolue. La note doit relever de la copro + AG
   *  ciblees (cloisonnement : l'UPDATE est borne a copro/AG, pas au seul noteId). */
  marquerNote(
    coproCode: string,
    agDateISO: string,
    noteId: string,
    resolu: boolean,
    par: string,
  ): Promise<void>;
  /** Pose / retire un flag (comptes verifies, envoyer avant). */
  setFlag(coproCode: string, agDateISO: string, flag: FlagCompta, valeur: boolean, par: string): Promise<void>;
  /** Pose le statut d'un poste de la checklist. Ecrit dans intranet_odj_champs
   *  (champ_id "compta.check.<slug>"), borne a la copro + AG. Le statut "a_verifier"
   *  efface l'entree (retour au defaut implicite). */
  setCheck(
    coproCode: string,
    agDateISO: string,
    slug: string,
    statut: StatutPoste,
    par: string,
  ): Promise<void>;
  /** Etats compta de plusieurs AG d'un coup (pour la file comptable). */
  getEtats(cles: { coproCode: string; agDateISO: string }[]): Promise<Map<string, EtatCompta>>;
}
