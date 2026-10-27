// Port de la persistance du tri des e-mails (ADR-046) : les binomes tenus dans l'intranet,
// les dossiers deja crees dans la boite, et le journal des rangements. Ne depend que du domaine.

import type { Binome, BinomesTri, DossierConnu, EntreeJournalTri } from "@/lib/domain/tri-emails";

export type NouvelleEntreeJournal = Omit<EntreeJournalTri, "id" | "faitLe" | "annuleLe">;

/** Ce que l'apprentissage des publicites lit d'une ligne de journal. */
export type HistoriqueExpediteur = Pick<EntreeJournalTri, "expediteur" | "objet" | "dossierCle" | "coproReference" | "copros">;

/**
 * Quelles lignes comptent pour dire qu'un mail est « deja range » ou « deja passe ».
 * Une ligne simulee n'a JAMAIS deplace le mail : quand l'ecriture est reelle, elle ne doit
 * ni cacher le mail de la file ni retenir le rangement automatique (mesure du 27/10/2026 :
 * 44 des 100 mails recents de syndic4 caches par des lignes simulees d'une session de dev
 * locale sur la meme base). En simulation (dev local), elles comptent comme avant.
 */
export interface OptionsDejaRange {
  /** true = ignorer les lignes `simulation = true`. */
  reellesSeulement: boolean;
}

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
  /** Les rangements non annules depuis cette date, les plus recents d'abord (plafonnes : revue a l'ecran, reconciliation). */
  journalDepuis(boite: string, depuisISO: string): Promise<EntreeJournalTri[]>;
  /**
   * Les rangements non annules depuis cette date vers ces dossiers (`dossierCle`), les plus
   * recents d'abord : ce que « Mes e-mails » distribue a un binome. Filtre en base, par lots
   * de cles : avant (27/10/2026), on relisait tout journalDepuis et son plafond de 500 lignes
   * faisait disparaitre les mails les plus anciens des binomes des que la boite etait active.
   */
  journalPourCles(boite: string, depuisISO: string, cles: string[]): Promise<EntreeJournalTri[]>;
  /** La ligne non annulee la plus recente de ce mail depuis cette date, ou null. */
  rangementActif(boite: string, internetMessageId: string, depuisISO: string): Promise<EntreeJournalTri | null>;
  /** Parmi ces internetMessageId, ceux qui ont un rangement non annule. */
  dejaRanges(boite: string, internetMessageIds: string[], opts: OptionsDejaRange): Promise<Set<string>>;
  /**
   * Parmi ces internetMessageId, ceux qui ont AU MOINS une ligne de journal, annulee ou non.
   * Le rangement automatique ne touche jamais un mail deja passe par le tri : range puis
   * remis dans la file, il attend la decision d'une personne.
   */
  dejaJournalises(boite: string, internetMessageIds: string[], opts: OptionsDejaRange): Promise<Set<string>>;
  /**
   * Pour chacune de ces conversations Graph, la copro du dernier rangement non annule (cle =
   * conversationId). Colonne absente (SQL pas encore passe) : vide.
   */
  coprosDesConversations(boite: string, conversationIds: string[]): Promise<Map<string, string>>;
  /**
   * Les rangements NON annules depuis cette date des mails de ces expediteurs (adresse
   * comparee sans la casse) : sert a apprendre les publicites (expediteursPublicite). Une
   * lecture groupee pour toute la file, pas une par mail. Table absente : vide.
   */
  historiqueExpediteurs(boite: string, expediteurs: string[], depuisISO: string): Promise<HistoriqueExpediteur[]>;
  /**
   * Marque la ligne annulee, SEULEMENT si elle ne l'est pas deja ; true = c'est cet appel
   * qui l'a marquee. La tache planifiee et l'ouverture de l'ecran peuvent traiter le meme
   * mail au meme instant : seul le premier poursuit.
   */
  marquerAnnule(id: string, par: string): Promise<boolean>;
}
