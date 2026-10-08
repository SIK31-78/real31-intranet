// Port de la persistance du tri des e-mails (ADR-046) : les binomes tenus dans l'intranet,
// les dossiers deja crees dans la boite, et le journal des rangements. Ne depend que du domaine.

import type { EntreeJournalTri, MembreTri } from "@/lib/domain/tri-emails";

export type NouvelleEntreeJournal = Omit<EntreeJournalTri, "id" | "faitLe" | "annuleLe">;

export interface TriRepository {
  /** Binomes tenus dans l'intranet : e-mail du gestionnaire (minuscules) -> son assistant. */
  binomes(): Promise<Record<string, MembreTri>>;
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
