// Port (contrat) du module « Contrats & contrôles » (REA-333). Ne dépend que du domaine.
//
// Source réelle : les tables de l'ancienne application « Suivi des Contrats Copros », gardées
// telles quelles dans la base partagée (InsuranceTracking, ElevatorCtq, GasVmcCtq,
// GasContractTracking, InsuranceOffer, GasOffer, CtqQuote, Elevator, Document, Copropriete
// pour le contrat courant, BuildingMetadata / Building pour la fiche immeuble, ReminderRule),
// plus deux tables natives (intranet_contrats_journal, intranet_copro_prestataire). Seul
// l'adapter connaît ces noms et le passage code copro <-> id technique.
//
// Les copros sont désignées par leur CODE (S0247, SE999…), jamais par l'uuid Prisma. Toutes les
// dates sont des jours ISO "YYYY-MM-DD". Aucun cloisonnement ici : le périmètre d'écriture est
// vérifié par les services (ADR-041, exigerPerimetre) ; la lecture est celle du cabinet.

import type {
  Ascenseur,
  Batiment,
  ContratCourant,
  Cycle,
  DevisCtq,
  DocumentContrat,
  EntreeJournalContrats,
  FicheImmeuble,
  MetierPrestataire,
  NouveauBatiment,
  NouveauCycle,
  NouveauDevisCtq,
  NouveauDocumentContrat,
  NouvelAscenseur,
  NouvelleEntreeJournal,
  NouvelleOffreAssurance,
  NouvelleOffreGaz,
  OffreAssurance,
  OffreGaz,
  PatchContratCourant,
  PatchFicheImmeuble,
  PrestataireCopro,
  RattachementDocument,
  RegleRelance,
  StatutCycle,
  SujetCtq,
  SujetSuivi,
} from "@/lib/domain/contrats-copro/types";

export interface FiltreCycles {
  /** Restreint à ces copros (codes). Absent = tout le cabinet. */
  coproCodes?: readonly string[];
  sujets?: readonly SujetSuivi[];
  statuts?: readonly StatutCycle[];
}

/** Clôture atomique au sens métier : le cycle clos et le suivant sont écrits ensemble. */
export interface ClotureCycle {
  /** Le cycle courant, complet, avec sa terminale datée et son statut "clos". */
  clos: Cycle;
  /** Le cycle suivant à créer ; absent en RE-clôture (le suivant existe déjà). */
  suivant?: NouveauCycle;
  /** En re-clôture : le suivant existant dont on ajuste la seule échéance. */
  suivantAjuste?: { id: string; sujet: SujetSuivi; echeanceISO: string | null };
}

export interface ContratsCoproRepository {
  // --- Cycles -------------------------------------------------------------------------
  /** Les cycles demandés, avec leurs étapes. [] si une table est absente (console.warn). */
  listerCycles(f: FiltreCycles): Promise<Cycle[]>;
  getCycle(sujet: SujetSuivi, id: string): Promise<Cycle | null>;
  creerCycle(c: NouveauCycle): Promise<Cycle>;
  /** Remplace étapes, échéance, statut, offre retenue, démarrage, notes. Lève si inconnu. */
  sauverCycle(c: Cycle): Promise<void>;
  /** Clôture : sauve le clos puis crée (ou ajuste) le suivant. Renvoie le suivant. */
  cloturer(c: ClotureCycle): Promise<Cycle | null>;

  // --- Appareils (ascenseurs) ---------------------------------------------------------
  listerAscenseurs(coproCodes?: readonly string[]): Promise<Ascenseur[]>;
  getAscenseur(id: string): Promise<Ascenseur | null>;
  creerAscenseur(a: NouvelAscenseur): Promise<Ascenseur>;
  sauverAscenseur(a: Ascenseur): Promise<void>;

  // --- Offres et devis ----------------------------------------------------------------
  /** Offres NON supprimées des cycles donnés. */
  listerOffresAssurance(cycleIds: readonly string[]): Promise<OffreAssurance[]>;
  creerOffreAssurance(o: NouvelleOffreAssurance): Promise<OffreAssurance>;
  /** Suppression logique (supprimeeLeISO). */
  supprimerOffreAssurance(id: string): Promise<void>;
  listerOffresGaz(cycleIds: readonly string[]): Promise<OffreGaz[]>;
  creerOffreGaz(o: NouvelleOffreGaz): Promise<OffreGaz>;
  supprimerOffreGaz(id: string): Promise<void>;
  /** Devis NON supprimés des copros données (les deux sujets CTQ). */
  listerDevisCtq(coproCodes: readonly string[]): Promise<DevisCtq[]>;
  creerDevisCtq(d: NouveauDevisCtq): Promise<DevisCtq>;
  supprimerDevisCtq(id: string): Promise<void>;
  /** Le devis retenu d'une copro pour un sujet (null = aucun). Porté par la copro. */
  setDevisRetenu(coproCode: string, sujet: SujetCtq, devisId: string | null): Promise<void>;

  // --- Contrat courant (colonnes de la copropriété) -----------------------------------
  getContratCourant(coproCode: string): Promise<ContratCourant | null>;
  /** Une lecture pour plusieurs copros (liste consolidée, à compléter). Clé = code. */
  listerContratsCourants(coproCodes?: readonly string[]): Promise<Map<string, ContratCourant>>;
  /** Applique un patch partiel ; `updatedAt` rafraîchi. Lève si la copro est inconnue. */
  setContratCourant(coproCode: string, patch: PatchContratCourant): Promise<void>;

  // --- Documents ----------------------------------------------------------------------
  /** Pointeurs NON supprimés, pour un rattachement donné ou toute la copro (toutes cibles). */
  listerDocuments(cible: RattachementDocument | { type: "toute_copro"; coproCode: string }): Promise<DocumentContrat[]>;
  getDocument(id: string): Promise<DocumentContrat | null>;
  creerDocument(d: NouveauDocumentContrat): Promise<DocumentContrat>;
  /** Suppression logique du pointeur (le fichier reste dans SharePoint). */
  supprimerDocument(id: string, parUserId: string): Promise<void>;

  // --- Prestataires de la copro (référentiel cabinet d'entreprises) --------------------
  listerPrestataires(coproCodes?: readonly string[]): Promise<PrestataireCopro[]>;
  /** Lie une entreprise à la copro pour un métier ; `principal` dégrade l'ancien principal. */
  lierPrestataire(p: { coproCode: string; entrepriseId: string; metier: MetierPrestataire; principal: boolean }): Promise<void>;
  delierPrestataire(coproCode: string, entrepriseId: string, metier: MetierPrestataire): Promise<void>;

  // --- Règles de relance --------------------------------------------------------------
  /** Les 4 règles (valeurs par défaut si la table manque). */
  listerReglesRelance(): Promise<Record<SujetSuivi, RegleRelance>>;
  sauverRegleRelance(r: RegleRelance): Promise<void>;

  // --- Journal (append-only) ----------------------------------------------------------
  ajouterJournal(e: NouvelleEntreeJournal): Promise<EntreeJournalContrats>;
  listerJournal(coproCode: string, limite?: number): Promise<EntreeJournalContrats[]>;

  // --- Fiche immeuble -----------------------------------------------------------------
  getFicheImmeuble(coproCode: string): Promise<FicheImmeuble | null>;
  /** Plusieurs copros d'un coup (file « bâtiments à compléter »). */
  listerFichesImmeuble(coproCodes?: readonly string[]): Promise<Map<string, FicheImmeuble>>;
  /** Crée la fiche si elle n'existe pas, sinon applique le patch. */
  sauverFicheImmeuble(coproCode: string, patch: PatchFicheImmeuble): Promise<void>;
  creerBatiment(b: NouveauBatiment): Promise<Batiment>;
  sauverBatiment(b: Batiment): Promise<void>;
  supprimerBatiment(id: string): Promise<void>;
}
