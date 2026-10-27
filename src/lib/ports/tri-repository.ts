// Port de la persistance du tri des e-mails (ADR-046) : les binomes tenus dans l'intranet,
// les dossiers deja crees dans la boite, et le journal des rangements. Ne depend que du domaine.
//
// Journal transactionnel (REA-420, 27/10/2026) : un rangement ouvre sa ligne « en_cours »
// AVANT de deplacer le mail (ouvrirRangement), puis la confirme (confirmerRangement). Toutes
// les lectures ne retiennent que les lignes ACTIVES : « fait », ou « en_cours » de moins de
// 2 min (un rangement en train de se faire compte comme range). Une ligne « en_cours » plus
// vieille est ignoree par les lectures et reprise par la tache planifiee (enCoursAReprendre).

import type { Binome, BinomesTri, DossierConnu, EntreeJournalTri } from "@/lib/domain/tri-emails";

export type NouvelleEntreeJournal = Omit<EntreeJournalTri, "id" | "faitLe" | "annuleLe" | "etat">;

/**
 * Ce mail a deja une ligne active (index unique partiel (boite, internet_message_id) des
 * rangements reels non annules, Postgres 23505) : c'est « deja range », pas une panne.
 */
export class DejaRangeErreur extends Error {
  constructor() {
    super("Ce mail a déjà été rangé (ou un rangement est en cours).");
    this.name = "DejaRangeErreur";
  }
}

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
  /** Ecrit une ligne deja « fait » (repli sans colonne `etat`, « glisse dans Outlook »). DejaRangeErreur sur doublon. */
  journaliser(e: NouvelleEntreeJournal): Promise<string>;
  /**
   * Ouvre la ligne « en_cours » d'un rangement, AVANT le deplacement (`messageId` provisoire).
   * null = colonne `etat` absente (SQL pas encore passe) : l'appelant journalise apres coup,
   * comme avant. DejaRangeErreur si le mail a deja une ligne active.
   */
  ouvrirRangement(e: NouvelleEntreeJournal): Promise<string | null>;
  /** Confirme la ligne : `etat = 'fait'`, `message_id` definitif. */
  confirmerRangement(id: string, messageId: string): Promise<void>;
  /**
   * Les lignes « en_cours », reelles et non annulees, ouvertes avant cette date (les plus
   * anciennes d'abord, `max` au plus) : rangements interrompus a reprendre. Colonne absente : vide.
   */
  enCoursAReprendre(boite: string, avantISO: string, max: number): Promise<EntreeJournalTri[]>;
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
   * mail au meme instant : seul le premier poursuit. `raison` : pourquoi l'app annule d'elle-
   * meme (par « systeme ») ; perdue sans la colonne `annule_raison`.
   */
  marquerAnnule(id: string, par: string, raison?: string): Promise<boolean>;
}
