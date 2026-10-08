// Port de la persistance du tri des e-mails (ADR-046) : les binomes tenus dans l'intranet,
// les dossiers deja crees dans la boite, et le journal des rangements. Ne depend que du domaine.

import type { Binome, BinomesTri, EntreeJournalTri } from "@/lib/domain/tri-emails";

export type NouvelleEntreeJournal = Omit<EntreeJournalTri, "id" | "faitLe" | "annuleLe">;

export interface TriRepository {
  /** Binomes tenus dans l'intranet et affectations des copros. */
  binomes(): Promise<BinomesTri>;
  /** Cree le binome (sans id) ou le met a jour (avec id) ; renvoie son id. */
  enregistrerBinome(b: Omit<Binome, "id"> & { id?: string }, par: string): Promise<string>;
  /** Supprime le binome ; ses copros reviennent au principal. */
  supprimerBinome(id: string): Promise<void>;
  /** Affecte la copro a un binome, ou la rend au principal (null). */
  affecterCopro(reference: string, binomeId: string | null, par: string): Promise<void>;
  /** Dossier deja cree pour cette cle dans cette boite, ou null. */
  dossier(boite: string, cle: string): Promise<{ folderId: string; nom: string } | null>;
  enregistrerDossier(boite: string, cle: string, d: { folderId: string; nom: string }): Promise<void>;
  journaliser(e: NouvelleEntreeJournal): Promise<string>;
  entree(id: string): Promise<EntreeJournalTri | null>;
  /** Les rangements non annules depuis cette date, les plus recents d'abord. */
  journalDepuis(boite: string, depuisISO: string): Promise<EntreeJournalTri[]>;
  /** Parmi ces internetMessageId, ceux qui ont un rangement non annule. */
  dejaRanges(boite: string, internetMessageIds: string[]): Promise<Set<string>>;
  marquerAnnule(id: string, par: string): Promise<void>;
}
