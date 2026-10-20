// Port de la persistance du tri des e-mails (ADR-046) : les binomes tenus dans l'intranet,
// les dossiers deja crees dans la boite, et le journal des rangements. Ne depend que du domaine.

import type { Binome, BinomesTri, DossierConnu, EntreeJournalTri } from "@/lib/domain/tri-emails";

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
  /** Tous les dossiers deja crees dans cette boite. */
  dossiers(boite: string): Promise<DossierConnu[]>;
  /** Precise ou corrige la copro d'une ligne de journal ; null = sans copro. */
  majCopro(id: string, reference: string | null): Promise<void>;
  journaliser(e: NouvelleEntreeJournal): Promise<string>;
  entree(id: string): Promise<EntreeJournalTri | null>;
  /** Les rangements non annules depuis cette date, les plus recents d'abord. */
  journalDepuis(boite: string, depuisISO: string): Promise<EntreeJournalTri[]>;
  /** Parmi ces internetMessageId, ceux qui ont un rangement non annule. */
  dejaRanges(boite: string, internetMessageIds: string[]): Promise<Set<string>>;
  /**
   * Parmi ces internetMessageId, ceux qui ont AU MOINS une ligne de journal, annulee ou non.
   * Le rangement automatique ne touche jamais un mail deja passe par le tri : range puis
   * remis dans la file, il attend la decision d'une personne.
   */
  dejaJournalises(boite: string, internetMessageIds: string[]): Promise<Set<string>>;
  /**
   * Pour chacune de ces conversations Graph, la copro du dernier rangement non annule (cle =
   * conversationId). Colonne absente (SQL pas encore passe) : vide.
   */
  coprosDesConversations(boite: string, conversationIds: string[]): Promise<Map<string, string>>;
  /**
   * Marque la ligne annulee, SEULEMENT si elle ne l'est pas deja ; true = c'est cet appel
   * qui l'a marquee. La tache planifiee et l'ouverture de l'ecran peuvent traiter le meme
   * mail au meme instant : seul le premier poursuit.
   */
  marquerAnnule(id: string, par: string): Promise<boolean>;
}
