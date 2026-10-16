// Adapter Supabase du module « Contrats & contrôles » (REA-333).
//
// Les données vivent dans les tables de l'ancienne application « Suivi des Contrats Copros »,
// gardées telles quelles dans la base partagée (décision du 16/10/2026) : InsuranceTracking,
// GasContractTracking, GasVmcCtq, ElevatorCtq, Elevator, InsuranceOffer, GasOffer, CtqQuote,
// Document, BuildingMetadata, Building, ReminderRule, plus les colonnes « contrat courant »
// de Copropriete. Deux tables natives s'y ajoutent : intranet_copro_prestataire et
// intranet_contrats_journal. Seul ce fichier connaît ces noms (PascalCase Prisma, colonnes
// camelCase) et le passage code copro <-> id technique.
//
// Pièges du schéma source, tous traités ici :
//   - les `id` sont du TEXT sans défaut (Prisma les générait côté client) : crypto.randomUUID()
//     à chaque insertion ; `updatedAt` est NOT NULL sans défaut : posé à chaque insert/update ;
//   - les dates sont des timestamp SANS fuseau écrits à minuit UTC : on lit les 10 premiers
//     caractères, jamais `new Date(...)`, et on écrit "YYYY-MM-DDT00:00:00.000Z" ;
//   - les montants `Decimal` arrivent en nombre JSON (parfois en chaîne selon la config) ;
//   - la suppression logique des offres (deletedAt / deletedById) dépend d'un SQL à passer
//     (supabase/sql/intranet_contrats_offres_suppression_logique.sql) : tant que la colonne
//     manque, la lecture repart sans le filtre et la suppression redevient physique, comme
//     dans l'ancienne application ;
//   - pas de transaction en supabase-js : `cloturer` écrit le cycle clos PUIS le suivant
//     (même approche qu'ADR-040), une panne entre les deux laisse un clos sans suivant, ce
//     que l'écran « à compléter » rattrape.
// Lecture dégradée (console.warn + []) quand une table n'existe pas encore ; écriture = erreur
// nommée, jamais un succès muet.

import type {
  Ascenseur,
  Batiment,
  ContratCourant,
  Cycle,
  DatesEtapes,
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
  TriEtat,
  TypeDocument,
  TypeJournal,
  TypePrixGaz,
} from "@/lib/domain/contrats-copro/types";
import { METIERS_PRESTATAIRE, REGLES_RELANCE_DEFAUT, SUJETS, TYPES_DOCUMENT } from "@/lib/domain/contrats-copro/types";
import type { ClotureCycle, ContratsCoproRepository, FiltreCycles } from "@/lib/ports/contrats-copro-repository";
import { createSupabasePublicClient } from "./public-client";
import { exigerUneLigne, filtreCodeCopro, idCoproUnique } from "./cible-copro";
import { toutesLesLignes } from "./pages";

type Sb = ReturnType<typeof createSupabasePublicClient>;
type Reponse = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type ErreurPg = { code?: string; message: string } | null;

// --- Tables et correspondances ------------------------------------------------------------

const TABLE_CYCLE: Record<SujetSuivi, string> = {
  assurance: "InsuranceTracking",
  gaz: "GasContractTracking",
  ctq_vmc: "GasVmcCtq",
  ctq_ascenseur: "ElevatorCtq",
};

const COLONNES_ETAPES_CTQ = {
  devis_demande: "devisRequestedAt",
  devis_recu: "devisReceivedAt",
  devis_presente: "devisPresentedAt",
  devis_valide: "devisValidatedAt",
  ctq_realise: "ctqRealizedAt",
  transmis_entreprise: "transmittedToCompanyAt",
  devis_entreprise_obtenu: "companyQuoteObtainedAt",
} as const;

/** Clé d'étape du domaine -> colonne de la table du sujet. */
const COLONNE_ETAPE: Record<SujetSuivi, Record<string, string>> = {
  assurance: {
    sinistralite_demandee: "sinistralityRequestedAt",
    sinistralite_recue: "sinistralityReceivedAt",
    offres_demandees: "offersRequestedAt",
    offres_recues: "offersReceivedAt",
    offres_presentees: "offersPresentedAt",
    validee: "validatedAt",
  },
  gaz: {
    devis_demande: "devisRequestedAt",
    devis_recu: "devisReceivedAt",
    devis_presente: "devisPresentedAt",
    validee: "validatedAt",
  },
  ctq_vmc: COLONNES_ETAPES_CTQ,
  ctq_ascenseur: COLONNES_ETAPES_CTQ,
};

const STATUT_DB: Record<StatutCycle, string> = { en_cours: "IN_PROGRESS", clos: "COMPLETED", archive: "ARCHIVED" };
const SUJET_CTQ_DB: Record<SujetCtq, string> = { ctq_ascenseur: "ELEVATOR_CTQ", ctq_vmc: "GAS_VMC_CTQ" };
const MODULE_DOC_DB: Record<SujetSuivi, string> = { assurance: "ASSURANCE", gaz: "GAZ", ctq_ascenseur: "CTQ_ASCENSEUR", ctq_vmc: "VMC_GAZ" };
const SUJET_RELANCE_DB: Record<SujetSuivi, string> = {
  assurance: "INSURANCE",
  gaz: "GAS_CONTRACT",
  ctq_ascenseur: "ELEVATOR_CTQ",
  ctq_vmc: "GAS_VMC_CTQ",
};
const TRI_ETAT_DB: Record<TriEtat, string> = { oui: "OUI", non: "NON", non_connue: "NON_CONNUE" };

function inverser<K extends string>(m: Record<K, string>): Map<string, K> {
  return new Map((Object.entries(m) as [K, string][]).map(([k, v]) => [v, k]));
}
const STATUT_DOMAINE = inverser(STATUT_DB);
const SUJET_CTQ_DOMAINE = inverser(SUJET_CTQ_DB);
const MODULE_DOC_DOMAINE = inverser(MODULE_DOC_DB);
const SUJET_RELANCE_DOMAINE = inverser(SUJET_RELANCE_DB);
const TRI_ETAT_DOMAINE = inverser(TRI_ETAT_DB);

const T_PRESTATAIRE = "intranet_copro_prestataire";
const T_JOURNAL = "intranet_contrats_journal";
const T_ENTREPRISE = "intranet_cles_entreprise";

/** Taille d'un lot pour les filtres `.in(...)` : l'URL PostgREST reste courte. */
const TAILLE_LOT = 100;

// --- Lignes typées ---------------------------------------------------------------------------

type CoproRefRow = { id: string; referenceCrypto: string | null; referenceEstale: string | null };

type CycleRow = {
  id: string;
  coproprieteId?: string;
  elevatorId?: string;
  nextDueDate: string | null;
  status: string;
  manuallyStarted: boolean | null;
  selectedOfferId?: string | null;
  notes?: string | null;
  createdAt: string;
} & Record<string, unknown>;

type ElevatorRow = {
  id: string;
  coproprieteId: string;
  identifier: string | null;
  lastCtqDate: string | null;
  notes: string | null;
};
const COLS_ELEVATOR = "id, coproprieteId, identifier, lastCtqDate, notes";

type InsuranceOfferRow = {
  id: string;
  insuranceTrackingId: string;
  insurer: string;
  proposedPremium: number | string;
  deductibleAmount: number | string;
  guarantees: string | null;
  receivedAt: string | null;
  deletedAt?: string | null;
};
const COLS_INSURANCE_OFFER = "id, insuranceTrackingId, insurer, proposedPremium, deductibleAmount, guarantees, receivedAt";

type GasOfferRow = {
  id: string;
  gasContractTrackingId: string;
  supplier: string;
  priceType: string;
  amount: number | string;
  contractDurationMonths: number;
  receivedAt: string | null;
  deletedAt?: string | null;
};
const COLS_GAS_OFFER = "id, gasContractTrackingId, supplier, priceType, amount, contractDurationMonths, receivedAt";

type CtqQuoteRow = {
  id: string;
  coproprieteId: string;
  sujet: string;
  supplier: string;
  amount: number | string;
  receivedAt: string | null;
  deletedAt?: string | null;
};
const COLS_CTQ_QUOTE = "id, coproprieteId, sujet, supplier, amount, receivedAt";

type ContratRow = CoproRefRow & {
  insuranceCompany: string | null;
  insuranceContractNumber: string | null;
  broker: string | null;
  insuranceSubscriptionDate: string | null;
  insuranceDueDate: string | null;
  gasSupplier: string | null;
  gasPriceType: string | null;
  gasCurrentAmount: number | string | null;
  gasDueDate: string | null;
  gasVmcCompany: string | null;
  gasVmcReference: string | null;
  lastGasVmcCtqDate: string | null;
  elevatorsCount: number | null;
  boilersCount: number | null;
  gasVmcCount: number | null;
  selectedElevatorQuoteId: string | null;
  selectedGasVmcQuoteId: string | null;
};
const COLS_CONTRAT =
  "id, referenceCrypto, referenceEstale, insuranceCompany, insuranceContractNumber, broker, " +
  "insuranceSubscriptionDate, insuranceDueDate, gasSupplier, gasPriceType, gasCurrentAmount, gasDueDate, " +
  "gasVmcCompany, gasVmcReference, lastGasVmcCtqDate, elevatorsCount, boilersCount, gasVmcCount, " +
  "selectedElevatorQuoteId, selectedGasVmcQuoteId";

type MetadataRow = {
  id: string;
  coproprieteId: string;
  surface: number | string | null;
  constructionYear: number | null;
  constructionPeriod: string | null;
  buildingsCount: number | null;
  heatingType: string | null;
  heatingEnergy: string | null;
  heatingSystem: string | null;
  hotWaterType: string | null;
  hotWaterSystem: string | null;
  hotWaterSameAsHeating: boolean | null;
  ventilationType: string | null;
  ventilationSystem: string | null;
  bornesRechargeVE: string | null;
  locauxVelos: string | null;
  dpeCollectifRealise: string | null;
  diagnosticStructureRealise: string | null;
  pptInscritAG: string | null;
  pptVote: string | null;
  pptAdoptionDate: string | null;
  currentInsurancePremium: number | string | null;
  notes: string | null;
};
const COLS_METADATA =
  "id, coproprieteId, surface, constructionYear, constructionPeriod, buildingsCount, heatingType, heatingEnergy, " +
  "heatingSystem, hotWaterType, hotWaterSystem, hotWaterSameAsHeating, ventilationType, ventilationSystem, " +
  "bornesRechargeVE, locauxVelos, dpeCollectifRealise, diagnosticStructureRealise, pptInscritAG, pptVote, " +
  "pptAdoptionDate, currentInsurancePremium, notes";

type BuildingRow = {
  id: string;
  coproprieteId: string;
  name: string;
  constructionYear: number | null;
  floorsCount: number | null;
  elevatorsCount: number | null;
  energyLabel: string | null;
};
const COLS_BUILDING = "id, coproprieteId, name, constructionYear, floorsCount, elevatorsCount, energyLabel";

type DocumentRow = {
  id: string;
  type: string;
  module: string;
  displayName: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  driveId: string;
  driveItemId: string;
  webUrl: string | null;
  uploadedById: string;
  uploadedAt: string;
  deletedAt: string | null;
  coproprieteId: string | null;
  insuranceOfferId: string | null;
  gasOfferId: string | null;
  ctqQuoteId: string | null;
  insuranceTrackingId: string | null;
};
const COLS_DOCUMENT =
  "id, type, module, displayName, originalFileName, mimeType, sizeBytes, driveId, driveItemId, webUrl, " +
  "uploadedById, uploadedAt, deletedAt, coproprieteId, insuranceOfferId, gasOfferId, ctqQuoteId, insuranceTrackingId";

type PrestataireRow = { copro_code: string; entreprise_id: string; metier: string; principal: boolean };
type EntrepriseRow = { id: string; nom: string; email: string | null };

type ReminderRuleRow = {
  subject: string;
  firstReminderOffsetDays: number;
  orangeThresholdDays: number;
  redThresholdDays: number;
  reminderFrequencyDays: number;
};

type JournalRow = {
  id: string;
  copro_code: string;
  sujet: string | null;
  cycle_id: string | null;
  type: string;
  horodatage: string;
  par_user_id: string | null;
  par_nom: string;
  details: Record<string, unknown> | null;
};
const COLS_JOURNAL = "id, copro_code, sujet, cycle_id, type, horodatage, par_user_id, par_nom, details";

// --- Petits outils ---------------------------------------------------------------------------

/** Jour ISO "YYYY-MM-DD" depuis un timestamp lu tel quel (pas de `new Date`, pas de fuseau). */
function jour(ts: string | null | undefined): string | null {
  return ts ? ts.slice(0, 10) : null;
}

/** Jour ISO -> timestamp à minuit UTC, la convention de la source. */
function horodatage(jourISO: string | null | undefined): string | null {
  return jourISO ? `${jourISO.slice(0, 10)}T00:00:00.000Z` : null;
}

/** Un timestamp sans fuseau de la source est en UTC : on le dit explicitement. */
function instant(ts: string): string {
  return /(Z|[+-]\d\d:?\d\d)$/.test(ts) ? ts : `${ts}Z`;
}

/** Les Decimal arrivent en nombre JSON, ou en chaîne selon la configuration PostgREST. */
function nombre(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function maintenant(): string {
  return new Date().toISOString();
}

function enLots<T>(xs: readonly T[], taille = TAILLE_LOT): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < xs.length; i += taille) lots.push(xs.slice(i, i + taille));
  return lots;
}

/** Lit par lots d'ids (`undefined` = pas de filtre, [] = rien à lire). */
async function surLots<T>(
  ids: readonly string[] | undefined,
  lire: (lot: readonly string[] | undefined) => Promise<T[]>,
): Promise<T[]> {
  if (!ids) return lire(undefined);
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (const lot of enLots([...new Set(ids)])) out.push(...(await lire(lot)));
  return out;
}

function avertir(contexte: string, message: string): void {
  console.warn(`[contrats-copro] ${contexte} : ${message}`);
}

function messageDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Table pas encore créée (PGRST205 « schema cache », 42P01 « relation does not exist »). */
function estTableAbsente(e: unknown): boolean {
  const m = messageDe(e);
  return (/schema cache|does not exist|PGRST205|42P01/i.test(m)) && !/column/i.test(m);
}

/** La colonne `deletedAt` n'existe pas encore sur les offres (SQL pas passé). */
function estColonneSuppressionAbsente(e: unknown): boolean {
  const m = messageDe(e);
  return m.includes("deletedAt") && (/does not exist/i.test(m) || m.includes("42703"));
}

function estColonneSuppressionAbsentePg(error: ErreurPg): boolean {
  return !!error && (error.code === "42703" || error.message.includes("deletedAt"));
}

/** Lecture complète tolérante : [] et un avertissement si la table n'existe pas. */
async function lireTolerant<T>(contexte: string, construire: (debut: number, fin: number) => Reponse): Promise<T[]> {
  try {
    return await toutesLesLignes<T>(contexte, construire);
  } catch (e) {
    if (estTableAbsente(e)) {
      // Le message porte déjà le contexte (toutesLesLignes le préfixe).
      console.warn(`[contrats-copro] ${messageDe(e)}`);
      return [];
    }
    throw e;
  }
}

/** Lecture des lignes NON supprimées ; sans la colonne deletedAt, relit sans le filtre. */
async function lireNonSupprimes<T>(
  contexte: string,
  construire: (debut: number, fin: number, avecSuppression: boolean) => Reponse,
): Promise<T[]> {
  try {
    return await lireTolerant<T>(contexte, (d, f) => construire(d, f, true));
  } catch (e) {
    if (!estColonneSuppressionAbsente(e)) throw e;
    avertir(contexte, "colonne deletedAt absente (SQL intranet_contrats_offres_suppression_logique.sql pas encore passé), lecture sans le filtre");
    return lireTolerant<T>(contexte, (d, f) => construire(d, f, false));
  }
}

function lever(contexte: string, error: ErreurPg): never {
  throw new Error(`${contexte} : ${error?.message ?? "erreur inconnue"}`);
}

/** Filtre `.or(...)` qui retrouve des copros par leurs codes (Crypto ou ESTALE). */
function filtreCodes(codes: readonly string[]): string {
  for (const c of codes) filtreCodeCopro(c); // valide chaque code (injection PostgREST)
  const liste = codes.join(",");
  return `referenceCrypto.in.(${liste}),referenceEstale.in.(${liste})`;
}

function codeDe(row: CoproRefRow): string {
  return row.referenceCrypto ?? row.referenceEstale ?? row.id;
}

/** Le référentiel réduit : code <-> id. */
type Referentiel = { idParCode: Map<string, string>; codeParId: Map<string, string> };

function referentielDepuis(rows: CoproRefRow[]): Referentiel {
  const idParCode = new Map<string, string>();
  const codeParId = new Map<string, string>();
  for (const r of rows) {
    codeParId.set(r.id, codeDe(r));
    // Les deux références pointent vers la fiche : une copro reprise de Crypto dans ESTALE
    // peut porter deux codes distincts, on la retrouve par l'un ou l'autre.
    if (r.referenceCrypto) idParCode.set(r.referenceCrypto, r.id);
    if (r.referenceEstale && !idParCode.has(r.referenceEstale)) idParCode.set(r.referenceEstale, r.id);
    if (!r.referenceCrypto && !r.referenceEstale) idParCode.set(r.id, r.id);
  }
  return { idParCode, codeParId };
}

// --- Mappings cycle ---------------------------------------------------------------------------

function colonnesCycle(sujet: SujetSuivi): string {
  const cols = ["id", "nextDueDate", "status", "manuallyStarted", "createdAt"];
  cols.push(sujet === "ctq_ascenseur" ? "elevatorId" : "coproprieteId");
  if (sujet === "assurance") cols.push("selectedOfferId", "notes");
  if (sujet === "gaz") cols.push("selectedOfferId");
  cols.push(...Object.values(COLONNE_ETAPE[sujet]));
  return cols.join(", ");
}

function statutDomaine(status: string): StatutCycle {
  return STATUT_DOMAINE.get(status) ?? "en_cours";
}

function cycleDepuisRow(
  sujet: SujetSuivi,
  row: CycleRow,
  coproCode: string,
  appareil?: { id: string; identifier: string | null },
): Cycle {
  const etapes: DatesEtapes = {};
  for (const [cle, col] of Object.entries(COLONNE_ETAPE[sujet])) {
    const v = row[col];
    if (typeof v === "string" && v) etapes[cle] = v.slice(0, 10);
  }
  return {
    id: row.id,
    sujet,
    coproCode,
    ...(appareil ? { ascenseurId: appareil.id, ascenseurIdentifiant: appareil.identifier } : {}),
    statut: statutDomaine(row.status),
    echeanceISO: jour(row.nextDueDate),
    etapes,
    demarreManuellement: row.manuallyStarted ?? null,
    ...(sujet === "assurance" || sujet === "gaz" ? { offreRetenueId: row.selectedOfferId ?? null } : {}),
    ...(sujet === "assurance" ? { notes: row.notes ?? null } : {}),
    creeLeISO: instant(row.createdAt),
  };
}

/** Les colonnes communes à l'insert et à l'update d'un cycle (sans le rattachement). */
function colonnesDepuisCycle(c: NouveauCycle | Cycle): Record<string, unknown> {
  const out: Record<string, unknown> = {
    nextDueDate: horodatage(c.echeanceISO),
    status: STATUT_DB[c.statut],
    manuallyStarted: c.demarreManuellement,
    updatedAt: maintenant(),
  };
  for (const [cle, col] of Object.entries(COLONNE_ETAPE[c.sujet])) out[col] = horodatage(c.etapes[cle]);
  if (c.sujet === "assurance" || c.sujet === "gaz") out.selectedOfferId = c.offreRetenueId ?? null;
  if (c.sujet === "assurance") out.notes = c.notes ?? null;
  return out;
}

// --- Mappings offres, devis, appareils -----------------------------------------------------

function ascenseurDepuisRow(r: ElevatorRow, coproCode: string): Ascenseur {
  return { id: r.id, coproCode, identifiant: r.identifier, dernierCtqISO: jour(r.lastCtqDate), notes: r.notes };
}

function offreAssuranceDepuisRow(r: InsuranceOfferRow): OffreAssurance {
  return {
    id: r.id,
    cycleId: r.insuranceTrackingId,
    assureur: r.insurer,
    prime: nombre(r.proposedPremium) ?? 0,
    franchise: nombre(r.deductibleAmount) ?? 0,
    garanties: r.guarantees,
    recueLeISO: jour(r.receivedAt),
    ...(r.deletedAt !== undefined ? { supprimeeLeISO: r.deletedAt ? instant(r.deletedAt) : null } : {}),
  };
}

function typePrixDomaine(v: string | null): TypePrixGaz | null {
  const bas = (v ?? "").toLowerCase();
  return bas === "variable" || bas === "fixe" ? bas : null;
}

function offreGazDepuisRow(r: GasOfferRow): OffreGaz {
  return {
    id: r.id,
    cycleId: r.gasContractTrackingId,
    fournisseur: r.supplier,
    typePrix: typePrixDomaine(r.priceType) ?? "variable",
    montant: nombre(r.amount) ?? 0,
    dureeMois: r.contractDurationMonths,
    recueLeISO: jour(r.receivedAt),
    ...(r.deletedAt !== undefined ? { supprimeeLeISO: r.deletedAt ? instant(r.deletedAt) : null } : {}),
  };
}

function devisDepuisRow(r: CtqQuoteRow, coproCode: string): DevisCtq {
  return {
    id: r.id,
    coproCode,
    sujet: SUJET_CTQ_DOMAINE.get(r.sujet) ?? "ctq_ascenseur",
    prestataire: r.supplier,
    montant: nombre(r.amount) ?? 0,
    recueLeISO: jour(r.receivedAt),
    ...(r.deletedAt !== undefined ? { supprimeeLeISO: r.deletedAt ? instant(r.deletedAt) : null } : {}),
  };
}

// --- Mappings contrat courant, documents, fiche immeuble -----------------------------------

function contratDepuisRow(row: ContratRow, meta: MetadataRow | undefined): ContratCourant {
  return {
    coproCode: codeDe(row),
    assurance: {
      compagnie: row.insuranceCompany,
      numeroContrat: row.insuranceContractNumber,
      courtier: row.broker,
      souscriptionISO: jour(row.insuranceSubscriptionDate),
      echeanceISO: jour(row.insuranceDueDate),
      prime: nombre(meta?.currentInsurancePremium),
    },
    gaz: {
      fournisseur: row.gasSupplier,
      typePrix: typePrixDomaine(row.gasPriceType),
      montant: nombre(row.gasCurrentAmount),
      echeanceISO: jour(row.gasDueDate),
    },
    vmc: {
      societe: row.gasVmcCompany,
      reference: row.gasVmcReference,
      dernierCtqISO: jour(row.lastGasVmcCtqDate),
    },
    compteurs: {
      ascenseurs: row.elevatorsCount,
      chaudieres: row.boilersCount,
      vmcGaz: row.gasVmcCount,
    },
    energieChauffage: meta?.heatingEnergy ?? null,
    devisRetenu: { ctq_ascenseur: row.selectedElevatorQuoteId, ctq_vmc: row.selectedGasVmcQuoteId },
  };
}

function typeDocumentDomaine(v: string): TypeDocument {
  const bas = v.toLowerCase() as TypeDocument;
  return (TYPES_DOCUMENT as readonly string[]).includes(bas) ? bas : "autre";
}

function rattachementDepuisRow(r: DocumentRow, codeParId: Map<string, string>): RattachementDocument {
  if (r.insuranceOfferId) return { type: "offre_assurance", offreId: r.insuranceOfferId };
  if (r.gasOfferId) return { type: "offre_gaz", offreId: r.gasOfferId };
  if (r.ctqQuoteId) return { type: "devis_ctq", devisId: r.ctqQuoteId };
  if (r.insuranceTrackingId) return { type: "cycle_assurance", cycleId: r.insuranceTrackingId };
  const id = r.coproprieteId ?? "";
  return { type: "copro", coproCode: codeParId.get(id) ?? id };
}

function documentDepuisRow(r: DocumentRow, codeParId: Map<string, string>): DocumentContrat {
  return {
    id: r.id,
    sujet: MODULE_DOC_DOMAINE.get(r.module) ?? "assurance",
    typeDocument: typeDocumentDomaine(r.type),
    nomAffiche: r.displayName,
    nomFichier: r.originalFileName,
    mime: r.mimeType,
    tailleOctets: r.sizeBytes,
    driveId: r.driveId,
    itemId: r.driveItemId,
    webUrl: r.webUrl,
    deposeParId: r.uploadedById,
    deposeLeISO: instant(r.uploadedAt),
    rattachement: rattachementDepuisRow(r, codeParId),
    supprimeLeISO: r.deletedAt ? instant(r.deletedAt) : null,
  };
}

function triEtatDomaine(v: string | null): TriEtat | null {
  return v ? (TRI_ETAT_DOMAINE.get(v) ?? null) : null;
}

function batimentDepuisRow(r: BuildingRow, coproCode: string): Batiment {
  return {
    id: r.id,
    coproCode,
    nom: r.name,
    anneeConstruction: r.constructionYear,
    nombreEtages: r.floorsCount,
    nombreAscenseurs: r.elevatorsCount,
    etiquetteEnergie: r.energyLabel,
  };
}

function ficheDepuis(coproCode: string, m: MetadataRow | undefined, batiments: Batiment[]): FicheImmeuble {
  return {
    coproCode,
    surfaceM2: nombre(m?.surface),
    anneeConstruction: m?.constructionYear ?? null,
    periodeConstruction: m?.constructionPeriod ?? null,
    nombreBatiments: m?.buildingsCount ?? null,
    chauffageType: m?.heatingType ?? null,
    chauffageEnergie: m?.heatingEnergy ?? null,
    chauffageSysteme: m?.heatingSystem ?? null,
    ecsType: m?.hotWaterType ?? null,
    ecsSysteme: m?.hotWaterSystem ?? null,
    ecsMemeQueChauffage: m?.hotWaterSameAsHeating ?? null,
    ventilationType: m?.ventilationType ?? null,
    ventilationSysteme: m?.ventilationSystem ?? null,
    bornesRechargeVE: triEtatDomaine(m?.bornesRechargeVE ?? null),
    locauxVelos: triEtatDomaine(m?.locauxVelos ?? null),
    dpeCollectifRealise: triEtatDomaine(m?.dpeCollectifRealise ?? null),
    diagnosticStructureRealise: triEtatDomaine(m?.diagnosticStructureRealise ?? null),
    pptInscritAG: triEtatDomaine(m?.pptInscritAG ?? null),
    pptVote: triEtatDomaine(m?.pptVote ?? null),
    pptAdoptionISO: jour(m?.pptAdoptionDate),
    primeAssuranceActuelle: nombre(m?.currentInsurancePremium),
    notes: m?.notes ?? null,
    batiments,
  };
}

/** Patch de fiche -> colonnes BuildingMetadata (seulement les clés présentes). */
function colonnesDepuisPatchFiche(p: PatchFicheImmeuble): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pose = (col: string, v: unknown) => {
    if (v !== undefined) out[col] = v;
  };
  const tri = (v: TriEtat | null | undefined) => (v === undefined ? undefined : v ? TRI_ETAT_DB[v] : null);
  pose("surface", p.surfaceM2);
  pose("constructionYear", p.anneeConstruction);
  pose("constructionPeriod", p.periodeConstruction);
  pose("buildingsCount", p.nombreBatiments);
  pose("heatingType", p.chauffageType);
  pose("heatingEnergy", p.chauffageEnergie);
  pose("heatingSystem", p.chauffageSysteme);
  pose("hotWaterType", p.ecsType);
  pose("hotWaterSystem", p.ecsSysteme);
  pose("hotWaterSameAsHeating", p.ecsMemeQueChauffage);
  pose("ventilationType", p.ventilationType);
  pose("ventilationSystem", p.ventilationSysteme);
  pose("bornesRechargeVE", tri(p.bornesRechargeVE));
  pose("locauxVelos", tri(p.locauxVelos));
  pose("dpeCollectifRealise", tri(p.dpeCollectifRealise));
  pose("diagnosticStructureRealise", tri(p.diagnosticStructureRealise));
  pose("pptInscritAG", tri(p.pptInscritAG));
  pose("pptVote", tri(p.pptVote));
  pose("pptAdoptionDate", p.pptAdoptionISO === undefined ? undefined : horodatage(p.pptAdoptionISO));
  pose("currentInsurancePremium", p.primeAssuranceActuelle);
  pose("notes", p.notes);
  return out;
}

function colonnesDepuisBatiment(b: NouveauBatiment | Batiment): Record<string, unknown> {
  return {
    name: b.nom,
    constructionYear: b.anneeConstruction,
    floorsCount: b.nombreEtages,
    elevatorsCount: b.nombreAscenseurs,
    energyLabel: b.etiquetteEnergie,
    updatedAt: maintenant(),
  };
}

function metierDomaine(v: string): MetierPrestataire | null {
  return (METIERS_PRESTATAIRE as readonly string[]).includes(v) ? (v as MetierPrestataire) : null;
}

function journalDepuisRow(r: JournalRow): EntreeJournalContrats {
  return {
    id: r.id,
    coproCode: r.copro_code,
    sujet: (SUJETS as readonly string[]).includes(r.sujet ?? "") ? (r.sujet as SujetSuivi) : null,
    cycleId: r.cycle_id,
    type: r.type as TypeJournal,
    horodatageISO: instant(r.horodatage),
    parUserId: r.par_user_id,
    parNom: r.par_nom,
    details: r.details ?? {},
  };
}

// --- L'adapter -------------------------------------------------------------------------------

export class SupabaseContratsCoproRepository implements ContratsCoproRepository {
  // ===== Référentiel (code <-> id) =====================================================

  /** Une lecture de Copropriete réduite aux références. Sans filtre = tout le parc (paginé). */
  private async referentiel(filtre: { codes?: readonly string[]; ids?: readonly string[] } = {}): Promise<Referentiel> {
    const sb = createSupabasePublicClient();
    const cols = "id, referenceCrypto, referenceEstale";
    const contexte = "Référentiel copro";
    let rows: CoproRefRow[];
    if (filtre.codes) {
      rows = await surLots(filtre.codes, (lot) =>
        toutesLesLignes<CoproRefRow>(contexte, (d, f) =>
          sb.from("Copropriete").select(cols).or(filtreCodes(lot!)).order("id").range(d, f),
        ),
      );
    } else if (filtre.ids) {
      rows = await surLots(filtre.ids, (lot) =>
        toutesLesLignes<CoproRefRow>(contexte, (d, f) =>
          sb.from("Copropriete").select(cols).in("id", [...lot!]).order("id").range(d, f),
        ),
      );
    } else {
      rows = await toutesLesLignes<CoproRefRow>(contexte, (d, f) =>
        sb.from("Copropriete").select(cols).order("id").range(d, f),
      );
    }
    return referentielDepuis(rows);
  }

  /** Les ids des copros désignées (toutes si `codes` absent), dans l'ordre du référentiel. */
  private async idsParCode(codes?: readonly string[]): Promise<{ ids: string[] | undefined; ref: Referentiel }> {
    const ref = await this.referentiel(codes ? { codes } : {});
    if (!codes) return { ids: undefined, ref };
    const ids = [...new Set(codes.map((c) => ref.idParCode.get(c)).filter((x): x is string => !!x))];
    return { ids, ref };
  }

  /** Le code d'une copro depuis son id (lecture ciblée du référentiel). */
  private async codeParId(id: string): Promise<string> {
    const ref = await this.referentiel({ ids: [id] });
    return ref.codeParId.get(id) ?? id;
  }

  // ===== Cycles =========================================================================

  private async lireAppareils(sb: Sb, coproIds: readonly string[] | undefined): Promise<ElevatorRow[]> {
    return surLots(coproIds, (lot) =>
      lireTolerant<ElevatorRow>("Lecture des ascenseurs", (d, f) => {
        let q = sb.from("Elevator").select(COLS_ELEVATOR).order("identifier").order("id").range(d, f);
        if (lot) q = q.in("coproprieteId", [...lot]);
        return q;
      }),
    );
  }

  private async lireCycles(
    sb: Sb,
    sujet: SujetSuivi,
    f: { parentIds?: readonly string[]; statuts?: readonly StatutCycle[] },
  ): Promise<CycleRow[]> {
    const table = TABLE_CYCLE[sujet];
    const colParent = sujet === "ctq_ascenseur" ? "elevatorId" : "coproprieteId";
    return surLots(f.parentIds, (lot) =>
      lireTolerant<CycleRow>(`Lecture ${table}`, (d, fin) => {
        let q = sb.from(table).select(colonnesCycle(sujet)).order("nextDueDate").order("id").range(d, fin);
        if (lot) q = q.in(colParent, [...lot]);
        if (f.statuts && f.statuts.length > 0) q = q.in("status", f.statuts.map((s) => STATUT_DB[s]));
        return q;
      }),
    );
  }

  async listerCycles(f: FiltreCycles): Promise<Cycle[]> {
    const sb = createSupabasePublicClient();
    const sujets = f.sujets && f.sujets.length > 0 ? f.sujets : SUJETS;
    const { ids: coproIds, ref } = await this.idsParCode(f.coproCodes);
    if (coproIds && coproIds.length === 0) return [];
    const codeDe = (id: string | undefined) => (id ? (ref.codeParId.get(id) ?? id) : "");

    const cycles: Cycle[] = [];
    for (const sujet of sujets) {
      if (sujet === "ctq_ascenseur") {
        // Le cycle est porté par l'APPAREIL : on passe par les ascenseurs des copros visées.
        const appareils = await this.lireAppareils(sb, coproIds);
        const parId = new Map(appareils.map((a) => [a.id, a]));
        const parentIds = coproIds ? appareils.map((a) => a.id) : undefined;
        if (parentIds && parentIds.length === 0) continue;
        const rows = await this.lireCycles(sb, sujet, { parentIds, statuts: f.statuts });
        for (const r of rows) {
          const a = r.elevatorId ? parId.get(r.elevatorId) : undefined;
          // Appareil absent (lecture dégradée) : le cycle reste visible, sans copro connue.
          cycles.push(cycleDepuisRow(sujet, r, codeDe(a?.coproprieteId), { id: r.elevatorId ?? "", identifier: a?.identifier ?? null }));
        }
      } else {
        const rows = await this.lireCycles(sb, sujet, { parentIds: coproIds, statuts: f.statuts });
        for (const r of rows) cycles.push(cycleDepuisRow(sujet, r, codeDe(r.coproprieteId)));
      }
    }
    return cycles;
  }

  async getCycle(sujet: SujetSuivi, id: string): Promise<Cycle | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE_CYCLE[sujet]).select(colonnesCycle(sujet)).eq("id", id).maybeSingle();
    if (error) lever(`Cycle ${sujet} ${id}`, error);
    if (!data) return null;
    const row = data as unknown as CycleRow;
    if (sujet === "ctq_ascenseur") {
      const appareil = await this.lireAppareil(sb, row.elevatorId ?? "");
      const code = appareil ? await this.codeParId(appareil.coproprieteId) : "";
      return cycleDepuisRow(sujet, row, code, { id: row.elevatorId ?? "", identifier: appareil?.identifier ?? null });
    }
    return cycleDepuisRow(sujet, row, await this.codeParId(row.coproprieteId ?? ""));
  }

  async creerCycle(c: NouveauCycle): Promise<Cycle> {
    const sb = createSupabasePublicClient();
    const contexte = `Création du cycle ${c.sujet} de ${c.coproCode}`;
    const coproId = await idCoproUnique(sb, c.coproCode, contexte);
    const ligne: Record<string, unknown> = { id: crypto.randomUUID(), ...colonnesDepuisCycle(c) };
    let appareil: ElevatorRow | null = null;
    if (c.sujet === "ctq_ascenseur") {
      if (!c.ascenseurId) throw new Error(`${contexte} : un cycle CTQ ascenseur doit désigner un appareil.`);
      appareil = await this.lireAppareil(sb, c.ascenseurId);
      if (!appareil) throw new Error(`${contexte} : appareil ${c.ascenseurId} introuvable.`);
      if (appareil.coproprieteId !== coproId) throw new Error(`${contexte} : l'appareil ${c.ascenseurId} n'est pas un ascenseur de cette copropriété.`);
      ligne.elevatorId = appareil.id;
    } else {
      ligne.coproprieteId = coproId;
    }
    const { data, error } = await sb.from(TABLE_CYCLE[c.sujet]).insert(ligne).select(colonnesCycle(c.sujet)).single();
    if (error) lever(contexte, error);
    const row = data as unknown as CycleRow;
    return cycleDepuisRow(c.sujet, row, c.coproCode, appareil ? { id: appareil.id, identifier: appareil.identifier } : undefined);
  }

  async sauverCycle(c: Cycle): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Enregistrement du cycle ${c.sujet} ${c.id}`;
    const { data, error } = await sb.from(TABLE_CYCLE[c.sujet]).update(colonnesDepuisCycle(c)).eq("id", c.id).select("id");
    exigerUneLigne(contexte, data, error);
  }

  /**
   * Pas de transaction côté supabase-js : on écrit le cycle clos D'ABORD (c'est le geste
   * métier, celui que l'utilisateur a demandé), puis le suivant. Une panne entre les deux
   * laisse un cycle clos sans suivant, que la file « à compléter » fait ressortir ; l'inverse
   * (un suivant sans clos) serait un doublon invisible, d'où l'ordre.
   */
  async cloturer(c: ClotureCycle): Promise<Cycle | null> {
    await this.sauverCycle(c.clos);
    if (c.suivant) return this.creerCycle(c.suivant);
    if (c.suivantAjuste) {
      const sb = createSupabasePublicClient();
      const { id, sujet, echeanceISO } = c.suivantAjuste;
      const { data, error } = await sb
        .from(TABLE_CYCLE[sujet])
        .update({ nextDueDate: horodatage(echeanceISO), updatedAt: maintenant() })
        .eq("id", id)
        .select("id");
      exigerUneLigne(`Ajustement de l'échéance du cycle ${sujet} ${id}`, data, error);
      return this.getCycle(sujet, id);
    }
    return null;
  }

  // ===== Appareils =====================================================================

  private async lireAppareil(sb: Sb, id: string): Promise<ElevatorRow | null> {
    if (!id) return null;
    const { data, error } = await sb.from("Elevator").select(COLS_ELEVATOR).eq("id", id).maybeSingle();
    if (error) lever(`Ascenseur ${id}`, error);
    return (data as unknown as ElevatorRow | null) ?? null;
  }

  async listerAscenseurs(coproCodes?: readonly string[]): Promise<Ascenseur[]> {
    const sb = createSupabasePublicClient();
    const { ids, ref } = await this.idsParCode(coproCodes);
    if (ids && ids.length === 0) return [];
    const rows = await this.lireAppareils(sb, ids);
    return rows.map((r) => ascenseurDepuisRow(r, ref.codeParId.get(r.coproprieteId) ?? r.coproprieteId));
  }

  async getAscenseur(id: string): Promise<Ascenseur | null> {
    const sb = createSupabasePublicClient();
    const row = await this.lireAppareil(sb, id);
    return row ? ascenseurDepuisRow(row, await this.codeParId(row.coproprieteId)) : null;
  }

  async creerAscenseur(a: NouvelAscenseur): Promise<Ascenseur> {
    const sb = createSupabasePublicClient();
    const contexte = `Création d'un ascenseur pour ${a.coproCode}`;
    const coproId = await idCoproUnique(sb, a.coproCode, contexte);
    const ligne = {
      id: crypto.randomUUID(),
      coproprieteId: coproId,
      identifier: a.identifiant,
      lastCtqDate: horodatage(a.dernierCtqISO),
      notes: a.notes ?? null,
      updatedAt: maintenant(),
    };
    const { data, error } = await sb.from("Elevator").insert(ligne).select(COLS_ELEVATOR).single();
    if (error) lever(contexte, error);
    return ascenseurDepuisRow(data as unknown as ElevatorRow, a.coproCode);
  }

  /** Met à jour l'identifiant, le dernier CTQ et les notes ; un appareil ne change pas de copro. */
  async sauverAscenseur(a: Ascenseur): Promise<void> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from("Elevator")
      .update({ identifier: a.identifiant, lastCtqDate: horodatage(a.dernierCtqISO), notes: a.notes ?? null, updatedAt: maintenant() })
      .eq("id", a.id)
      .select("id");
    exigerUneLigne(`Enregistrement de l'ascenseur ${a.id}`, data, error);
  }

  // ===== Offres et devis ===============================================================

  async listerOffresAssurance(cycleIds: readonly string[]): Promise<OffreAssurance[]> {
    const sb = createSupabasePublicClient();
    const rows = await surLots(cycleIds, (lot) =>
      lireNonSupprimes<InsuranceOfferRow>("Lecture des offres d'assurance", (d, f, avecSuppression) => {
        let q = sb
          .from("InsuranceOffer")
          .select(avecSuppression ? `${COLS_INSURANCE_OFFER}, deletedAt` : COLS_INSURANCE_OFFER)
          .in("insuranceTrackingId", [...lot!])
          .order("receivedAt")
          .order("id")
          .range(d, f);
        if (avecSuppression) q = q.is("deletedAt", null);
        return q;
      }),
    );
    return rows.map(offreAssuranceDepuisRow);
  }

  async creerOffreAssurance(o: NouvelleOffreAssurance): Promise<OffreAssurance> {
    const sb = createSupabasePublicClient();
    const ligne = {
      id: crypto.randomUUID(),
      insuranceTrackingId: o.cycleId,
      insurer: o.assureur,
      proposedPremium: o.prime,
      deductibleAmount: o.franchise,
      guarantees: o.garanties,
      receivedAt: horodatage(o.recueLeISO),
      updatedAt: maintenant(),
    };
    const { data, error } = await sb.from("InsuranceOffer").insert(ligne).select(COLS_INSURANCE_OFFER).single();
    if (error) lever(`Création d'une offre d'assurance (cycle ${o.cycleId})`, error);
    return offreAssuranceDepuisRow(data as unknown as InsuranceOfferRow);
  }

  async supprimerOffreAssurance(id: string): Promise<void> {
    await this.supprimerLogiquement("InsuranceOffer", id, `Retrait de l'offre d'assurance ${id}`);
  }

  async listerOffresGaz(cycleIds: readonly string[]): Promise<OffreGaz[]> {
    const sb = createSupabasePublicClient();
    const rows = await surLots(cycleIds, (lot) =>
      lireNonSupprimes<GasOfferRow>("Lecture des offres gaz", (d, f, avecSuppression) => {
        let q = sb
          .from("GasOffer")
          .select(avecSuppression ? `${COLS_GAS_OFFER}, deletedAt` : COLS_GAS_OFFER)
          .in("gasContractTrackingId", [...lot!])
          .order("receivedAt")
          .order("id")
          .range(d, f);
        if (avecSuppression) q = q.is("deletedAt", null);
        return q;
      }),
    );
    return rows.map(offreGazDepuisRow);
  }

  async creerOffreGaz(o: NouvelleOffreGaz): Promise<OffreGaz> {
    const sb = createSupabasePublicClient();
    const ligne = {
      id: crypto.randomUUID(),
      gasContractTrackingId: o.cycleId,
      supplier: o.fournisseur,
      priceType: o.typePrix.toUpperCase(),
      amount: o.montant,
      contractDurationMonths: o.dureeMois,
      receivedAt: horodatage(o.recueLeISO),
      updatedAt: maintenant(),
    };
    const { data, error } = await sb.from("GasOffer").insert(ligne).select(COLS_GAS_OFFER).single();
    if (error) lever(`Création d'une offre gaz (cycle ${o.cycleId})`, error);
    return offreGazDepuisRow(data as unknown as GasOfferRow);
  }

  async supprimerOffreGaz(id: string): Promise<void> {
    await this.supprimerLogiquement("GasOffer", id, `Retrait de l'offre gaz ${id}`);
  }

  async listerDevisCtq(coproCodes: readonly string[]): Promise<DevisCtq[]> {
    const sb = createSupabasePublicClient();
    const { ids, ref } = await this.idsParCode(coproCodes);
    const rows = await surLots(ids ?? [], (lot) =>
      lireNonSupprimes<CtqQuoteRow>("Lecture des devis CTQ", (d, f, avecSuppression) => {
        let q = sb
          .from("CtqQuote")
          .select(avecSuppression ? `${COLS_CTQ_QUOTE}, deletedAt` : COLS_CTQ_QUOTE)
          .in("coproprieteId", [...lot!])
          .order("receivedAt")
          .order("id")
          .range(d, f);
        if (avecSuppression) q = q.is("deletedAt", null);
        return q;
      }),
    );
    return rows.map((r) => devisDepuisRow(r, ref.codeParId.get(r.coproprieteId) ?? r.coproprieteId));
  }

  async creerDevisCtq(d: NouveauDevisCtq): Promise<DevisCtq> {
    const sb = createSupabasePublicClient();
    const contexte = `Création d'un devis ${d.sujet} pour ${d.coproCode}`;
    const coproId = await idCoproUnique(sb, d.coproCode, contexte);
    const ligne = {
      id: crypto.randomUUID(),
      coproprieteId: coproId,
      sujet: SUJET_CTQ_DB[d.sujet],
      supplier: d.prestataire,
      amount: d.montant,
      receivedAt: horodatage(d.recueLeISO),
      updatedAt: maintenant(),
    };
    const { data, error } = await sb.from("CtqQuote").insert(ligne).select(COLS_CTQ_QUOTE).single();
    if (error) lever(contexte, error);
    return devisDepuisRow(data as unknown as CtqQuoteRow, d.coproCode);
  }

  async supprimerDevisCtq(id: string): Promise<void> {
    await this.supprimerLogiquement("CtqQuote", id, `Retrait du devis ${id}`);
  }

  /**
   * Suppression logique (deletedAt). Si la colonne n'existe pas encore (SQL pas passé),
   * on retombe sur la suppression physique de l'ancienne application, en l'annonçant.
   */
  private async supprimerLogiquement(table: string, id: string, contexte: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(table).update({ deletedAt: maintenant(), updatedAt: maintenant() }).eq("id", id).select("id");
    if (estColonneSuppressionAbsentePg(error)) {
      avertir(contexte, "colonne deletedAt absente, suppression physique (SQL intranet_contrats_offres_suppression_logique.sql à passer)");
      const { data: sup, error: errSup } = await sb.from(table).delete().eq("id", id).select("id");
      exigerUneLigne(contexte, sup, errSup);
      return;
    }
    exigerUneLigne(contexte, data, error);
  }

  async setDevisRetenu(coproCode: string, sujet: SujetCtq, devisId: string | null): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Devis ${sujet} retenu pour ${coproCode}`;
    const id = await idCoproUnique(sb, coproCode, contexte);
    const colonne = sujet === "ctq_ascenseur" ? "selectedElevatorQuoteId" : "selectedGasVmcQuoteId";
    const { data, error } = await sb
      .from("Copropriete")
      .update({ [colonne]: devisId, updatedAt: maintenant() })
      .eq("id", id)
      .select("id");
    exigerUneLigne(contexte, data, error);
  }

  // ===== Contrat courant ===============================================================

  private async lireMetadata(sb: Sb, coproIds: readonly string[] | undefined): Promise<Map<string, MetadataRow>> {
    const rows = await surLots(coproIds, (lot) =>
      lireTolerant<MetadataRow>("Lecture de BuildingMetadata", (d, f) => {
        let q = sb.from("BuildingMetadata").select(COLS_METADATA).order("id").range(d, f);
        if (lot) q = q.in("coproprieteId", [...lot]);
        return q;
      }),
    );
    return new Map(rows.map((r) => [r.coproprieteId, r]));
  }

  async getContratCourant(coproCode: string): Promise<ContratCourant | null> {
    const tous = await this.listerContratsCourants([coproCode]);
    return tous.get(coproCode) ?? [...tous.values()][0] ?? null;
  }

  async listerContratsCourants(coproCodes?: readonly string[]): Promise<Map<string, ContratCourant>> {
    const sb = createSupabasePublicClient();
    const contexte = "Lecture des contrats courants";
    const rows = await surLots(coproCodes, (lot) =>
      toutesLesLignes<ContratRow>(contexte, (d, f) => {
        let q = sb.from("Copropriete").select(COLS_CONTRAT).order("id").range(d, f);
        if (lot) q = q.or(filtreCodes(lot));
        return q;
      }),
    );
    if (rows.length === 0) return new Map();
    const meta = await this.lireMetadata(sb, coproCodes ? rows.map((r) => r.id) : undefined);
    const out = new Map<string, ContratCourant>();
    for (const r of rows) out.set(codeDe(r), contratDepuisRow(r, meta.get(r.id)));
    return out;
  }

  async setContratCourant(coproCode: string, patch: PatchContratCourant): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Correction du contrat courant de ${coproCode}`;
    const id = await idCoproUnique(sb, coproCode, contexte);

    // Seules les clés PRÉSENTES du patch sont écrites : un champ absent n'écrase rien.
    const maj: Record<string, unknown> = {};
    const pose = (col: string, v: unknown) => {
      if (v !== undefined) maj[col] = v;
    };
    const a = patch.assurance ?? {};
    pose("insuranceCompany", a.compagnie);
    pose("insuranceContractNumber", a.numeroContrat);
    pose("broker", a.courtier);
    pose("insuranceSubscriptionDate", a.souscriptionISO === undefined ? undefined : horodatage(a.souscriptionISO));
    pose("insuranceDueDate", a.echeanceISO === undefined ? undefined : horodatage(a.echeanceISO));
    const g = patch.gaz ?? {};
    pose("gasSupplier", g.fournisseur);
    pose("gasPriceType", g.typePrix === undefined ? undefined : g.typePrix ? g.typePrix.toUpperCase() : null);
    pose("gasCurrentAmount", g.montant);
    pose("gasDueDate", g.echeanceISO === undefined ? undefined : horodatage(g.echeanceISO));
    const v = patch.vmc ?? {};
    pose("gasVmcCompany", v.societe);
    pose("gasVmcReference", v.reference);
    pose("lastGasVmcCtqDate", v.dernierCtqISO === undefined ? undefined : horodatage(v.dernierCtqISO));
    const k = patch.compteurs ?? {};
    pose("elevatorsCount", k.ascenseurs);
    pose("boilersCount", k.chaudieres);
    pose("gasVmcCount", k.vmcGaz);

    if (Object.keys(maj).length > 0) {
      const { data, error } = await sb
        .from("Copropriete")
        .update({ ...maj, updatedAt: maintenant() })
        .eq("id", id)
        .select("id");
      exigerUneLigne(contexte, data, error);
    }
    // La prime vit dans la fiche immeuble (BuildingMetadata, 1:1 par copro).
    if (a.prime !== undefined) await this.upsertMetadata(sb, id, { currentInsurancePremium: a.prime }, contexte);
  }

  // ===== Documents =====================================================================

  private async lireDocuments(sb: Sb, colonne: string, ids: readonly string[]): Promise<DocumentRow[]> {
    return surLots(ids, (lot) =>
      lireTolerant<DocumentRow>("Lecture des documents", (d, f) =>
        sb.from("Document").select(COLS_DOCUMENT).in(colonne, [...lot!]).is("deletedAt", null).order("uploadedAt", { ascending: false }).order("id").range(d, f),
      ),
    );
  }

  /** Les ids d'une table filtrés par une colonne (pour remonter offres et devis d'une copro). */
  private async idsOu(sb: Sb, table: string, colonne: string, valeurs: readonly string[]): Promise<string[]> {
    const rows = await surLots(valeurs, (lot) =>
      lireTolerant<{ id: string }>(`Lecture ${table}`, (d, f) => sb.from(table).select("id").in(colonne, [...lot!]).order("id").range(d, f)),
    );
    return rows.map((r) => r.id);
  }

  async listerDocuments(cible: RattachementDocument | { type: "toute_copro"; coproCode: string }): Promise<DocumentContrat[]> {
    const sb = createSupabasePublicClient();
    let rows: DocumentRow[] = [];
    let ref: Referentiel | null = null;

    if (cible.type === "copro" || cible.type === "toute_copro") {
      const res = await this.idsParCode([cible.coproCode]);
      ref = res.ref;
      const coproId = res.ids?.[0];
      if (!coproId) return [];
      rows = await this.lireDocuments(sb, "coproprieteId", [coproId]);
      if (cible.type === "toute_copro") {
        // Tout ce qui touche la copro : ses cycles d'assurance, les offres de ses cycles
        // (assurance et gaz) et ses devis CTQ. Les offres retirées gardent leurs documents.
        const cyclesAssurance = await this.idsOu(sb, "InsuranceTracking", "coproprieteId", [coproId]);
        const cyclesGaz = await this.idsOu(sb, "GasContractTracking", "coproprieteId", [coproId]);
        const offresAssurance = await this.idsOu(sb, "InsuranceOffer", "insuranceTrackingId", cyclesAssurance);
        const offresGaz = await this.idsOu(sb, "GasOffer", "gasContractTrackingId", cyclesGaz);
        const devis = await this.idsOu(sb, "CtqQuote", "coproprieteId", [coproId]);
        rows.push(
          ...(await this.lireDocuments(sb, "insuranceTrackingId", cyclesAssurance)),
          ...(await this.lireDocuments(sb, "insuranceOfferId", offresAssurance)),
          ...(await this.lireDocuments(sb, "gasOfferId", offresGaz)),
          ...(await this.lireDocuments(sb, "ctqQuoteId", devis)),
        );
      }
    } else if (cible.type === "cycle_assurance") {
      rows = await this.lireDocuments(sb, "insuranceTrackingId", [cible.cycleId]);
    } else if (cible.type === "offre_assurance") {
      rows = await this.lireDocuments(sb, "insuranceOfferId", [cible.offreId]);
    } else if (cible.type === "offre_gaz") {
      rows = await this.lireDocuments(sb, "gasOfferId", [cible.offreId]);
    } else {
      rows = await this.lireDocuments(sb, "ctqQuoteId", [cible.devisId]);
    }

    // Dédoublonnage (un pointeur n'a qu'un rattachement, mais on reste prudent).
    const vus = new Set<string>();
    const uniques = rows.filter((r) => (vus.has(r.id) ? false : (vus.add(r.id), true)));
    const codeParId = ref?.codeParId ?? new Map<string, string>();
    const idsSansCode = [...new Set(uniques.map((r) => r.coproprieteId).filter((x): x is string => !!x && !codeParId.has(x)))];
    if (idsSansCode.length > 0) {
      const r2 = await this.referentiel({ ids: idsSansCode });
      for (const [id, code] of r2.codeParId) codeParId.set(id, code);
    }
    return uniques
      .map((r) => documentDepuisRow(r, codeParId))
      .sort((x, y) => y.deposeLeISO.localeCompare(x.deposeLeISO));
  }

  async getDocument(id: string): Promise<DocumentContrat | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from("Document").select(COLS_DOCUMENT).eq("id", id).maybeSingle();
    if (error) lever(`Document ${id}`, error);
    if (!data) return null;
    const row = data as unknown as DocumentRow;
    const codeParId = row.coproprieteId ? (await this.referentiel({ ids: [row.coproprieteId] })).codeParId : new Map<string, string>();
    return documentDepuisRow(row, codeParId);
  }

  async creerDocument(d: NouveauDocumentContrat): Promise<DocumentContrat> {
    const sb = createSupabasePublicClient();
    const contexte = `Dépôt du document « ${d.nomAffiche} »`;
    // Rattachement EXCLUSIF : une seule des cinq colonnes (CHECK en base).
    const rattachement: Record<string, string | null> = {
      coproprieteId: null,
      insuranceOfferId: null,
      gasOfferId: null,
      ctqQuoteId: null,
      insuranceTrackingId: null,
    };
    const r = d.rattachement;
    if (r.type === "copro") rattachement.coproprieteId = await idCoproUnique(sb, r.coproCode, contexte);
    else if (r.type === "cycle_assurance") rattachement.insuranceTrackingId = r.cycleId;
    else if (r.type === "offre_assurance") rattachement.insuranceOfferId = r.offreId;
    else if (r.type === "offre_gaz") rattachement.gasOfferId = r.offreId;
    else rattachement.ctqQuoteId = r.devisId;

    const ligne = {
      id: crypto.randomUUID(),
      type: d.typeDocument.toUpperCase(),
      module: MODULE_DOC_DB[d.sujet],
      displayName: d.nomAffiche,
      originalFileName: d.nomFichier,
      mimeType: d.mime,
      sizeBytes: d.tailleOctets,
      driveId: d.driveId,
      driveItemId: d.itemId,
      webUrl: d.webUrl,
      uploadedById: d.deposeParId,
      uploadedAt: d.deposeLeISO,
      ...rattachement,
    };
    const { data, error } = await sb.from("Document").insert(ligne).select(COLS_DOCUMENT).single();
    if (error) lever(contexte, error);
    const row = data as unknown as DocumentRow;
    const codeParId = new Map<string, string>();
    if (r.type === "copro" && row.coproprieteId) codeParId.set(row.coproprieteId, r.coproCode);
    return documentDepuisRow(row, codeParId);
  }

  async supprimerDocument(id: string, parUserId: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from("Document")
      .update({ deletedAt: maintenant(), deletedById: parUserId })
      .eq("id", id)
      .is("deletedAt", null)
      .select("id");
    exigerUneLigne(`Retrait du document ${id}`, data, error);
  }

  // ===== Prestataires ==================================================================

  async listerPrestataires(coproCodes?: readonly string[]): Promise<PrestataireCopro[]> {
    const sb = createSupabasePublicClient();
    const contexte = "Lecture des prestataires";
    const liaisons = await surLots(coproCodes, (lot) =>
      lireTolerant<PrestataireRow>(contexte, (d, f) => {
        let q = sb.from(T_PRESTATAIRE).select("copro_code, entreprise_id, metier, principal").order("copro_code").order("metier").order("entreprise_id").range(d, f);
        if (lot) q = q.in("copro_code", [...lot]);
        return q;
      }),
    );
    if (liaisons.length === 0) return [];
    const entreprises = await surLots([...new Set(liaisons.map((l) => l.entreprise_id))], (lot) =>
      lireTolerant<EntrepriseRow>(`${contexte} (entreprises)`, (d, f) => sb.from(T_ENTREPRISE).select("id, nom, email").in("id", [...lot!]).order("id").range(d, f)),
    );
    const parId = new Map(entreprises.map((e) => [e.id, e]));
    return liaisons.flatMap((l) => {
      const metier = metierDomaine(l.metier);
      if (!metier) return [];
      const e = parId.get(l.entreprise_id);
      return [{
        coproCode: l.copro_code,
        entrepriseId: l.entreprise_id,
        entrepriseNom: e?.nom ?? "(entreprise inconnue)",
        metier,
        principal: l.principal,
        email: e?.email ?? null,
      }];
    });
  }

  async lierPrestataire(p: { coproCode: string; entrepriseId: string; metier: MetierPrestataire; principal: boolean }): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Rattachement de l'entreprise ${p.entrepriseId} à ${p.coproCode} (${p.metier})`;
    filtreCodeCopro(p.coproCode); // valide le code
    if (p.principal) {
      // Un seul principal par métier : l'ancien redevient secondaire.
      const { error } = await sb
        .from(T_PRESTATAIRE)
        .update({ principal: false })
        .eq("copro_code", p.coproCode)
        .eq("metier", p.metier)
        .eq("principal", true)
        .neq("entreprise_id", p.entrepriseId);
      if (error) this.leverEcritureNative(contexte, T_PRESTATAIRE, error);
    }
    const { error } = await sb
      .from(T_PRESTATAIRE)
      .upsert(
        { copro_code: p.coproCode, entreprise_id: p.entrepriseId, metier: p.metier, principal: p.principal },
        { onConflict: "copro_code,entreprise_id,metier" },
      );
    if (error) this.leverEcritureNative(contexte, T_PRESTATAIRE, error);
  }

  async delierPrestataire(coproCode: string, entrepriseId: string, metier: MetierPrestataire): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Détachement de l'entreprise ${entrepriseId} de ${coproCode} (${metier})`;
    const { data, error } = await sb
      .from(T_PRESTATAIRE)
      .delete()
      .eq("copro_code", coproCode)
      .eq("entreprise_id", entrepriseId)
      .eq("metier", metier)
      .select("entreprise_id");
    if (error) this.leverEcritureNative(contexte, T_PRESTATAIRE, error);
    if (!data || data.length === 0) throw new Error(`${contexte} : ce rattachement n'existe pas.`);
  }

  /** Erreur d'écriture sur une table native : on dit si c'est le SQL qui manque. */
  private leverEcritureNative(contexte: string, table: string, error: { code?: string; message: string }): never {
    if (estTableAbsente(error.message) || error.code === "PGRST205" || error.code === "42P01") {
      throw new Error(`${contexte} : la table ${table} n'existe pas encore dans la base (SQL supabase/sql à passer).`);
    }
    throw new Error(`${contexte} : ${error.message}`);
  }

  // ===== Règles de relance =============================================================

  async listerReglesRelance(): Promise<Record<SujetSuivi, RegleRelance>> {
    const sb = createSupabasePublicClient();
    const regles: Record<SujetSuivi, RegleRelance> = { ...REGLES_RELANCE_DEFAUT };
    const { data, error } = await sb
      .from("ReminderRule")
      .select("subject, firstReminderOffsetDays, orangeThresholdDays, redThresholdDays, reminderFrequencyDays");
    if (error) {
      avertir("Lecture des règles de relance", `${error.message} (valeurs par défaut)`);
      return regles;
    }
    for (const r of (data ?? []) as unknown as ReminderRuleRow[]) {
      const sujet = SUJET_RELANCE_DOMAINE.get(r.subject);
      if (!sujet) continue; // CTQ_REMEDIATION : hors périmètre
      regles[sujet] = {
        sujet,
        premierRappelJours: r.firstReminderOffsetDays,
        orangeJours: r.orangeThresholdDays,
        rougeJours: r.redThresholdDays,
        cadenceJours: r.reminderFrequencyDays,
      };
    }
    return regles;
  }

  async sauverRegleRelance(r: RegleRelance): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Règle de relance ${r.sujet}`;
    const valeurs = {
      firstReminderOffsetDays: r.premierRappelJours,
      orangeThresholdDays: r.orangeJours,
      redThresholdDays: r.rougeJours,
      reminderFrequencyDays: r.cadenceJours,
      updatedAt: maintenant(),
    };
    const subject = SUJET_RELANCE_DB[r.sujet];
    const { data, error } = await sb.from("ReminderRule").update(valeurs).eq("subject", subject).select("id");
    if (error) lever(contexte, error);
    if (data && data.length > 0) return;
    // Ligne absente (table repartie de zéro) : on la crée, l'id est à notre charge.
    const { error: errInsert } = await sb.from("ReminderRule").insert({ id: crypto.randomUUID(), subject, ...valeurs });
    if (errInsert) lever(contexte, errInsert);
  }

  // ===== Journal =======================================================================

  async ajouterJournal(e: NouvelleEntreeJournal): Promise<EntreeJournalContrats> {
    const sb = createSupabasePublicClient();
    const contexte = `Journal de ${e.coproCode} (${e.type})`;
    const { data, error } = await sb
      .from(T_JOURNAL)
      .insert({
        copro_code: e.coproCode,
        sujet: e.sujet,
        cycle_id: e.cycleId,
        type: e.type,
        par_user_id: e.parUserId,
        par_nom: e.parNom,
        details: e.details,
      })
      .select(COLS_JOURNAL)
      .single();
    if (error) this.leverEcritureNative(contexte, T_JOURNAL, error);
    return journalDepuisRow(data as unknown as JournalRow);
  }

  async listerJournal(coproCode: string, limite = 200): Promise<EntreeJournalContrats[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_JOURNAL)
      .select(COLS_JOURNAL)
      .eq("copro_code", coproCode)
      .order("horodatage", { ascending: false })
      .limit(limite);
    if (error) {
      avertir(`Journal de ${coproCode}`, error.message);
      return [];
    }
    return ((data ?? []) as unknown as JournalRow[]).map(journalDepuisRow);
  }

  // ===== Fiche immeuble ================================================================

  async getFicheImmeuble(coproCode: string): Promise<FicheImmeuble | null> {
    const fiches = await this.listerFichesImmeuble([coproCode]);
    return fiches.get(coproCode) ?? [...fiches.values()][0] ?? null;
  }

  /** Une fiche existe dès qu'il y a une ligne BuildingMetadata ou au moins un bâtiment. */
  async listerFichesImmeuble(coproCodes?: readonly string[]): Promise<Map<string, FicheImmeuble>> {
    const sb = createSupabasePublicClient();
    const { ids, ref } = await this.idsParCode(coproCodes);
    if (ids && ids.length === 0) return new Map();
    const meta = await this.lireMetadata(sb, ids);
    const batiments = await surLots(ids, (lot) =>
      lireTolerant<BuildingRow>("Lecture des bâtiments", (d, f) => {
        let q = sb.from("Building").select(COLS_BUILDING).order("name").order("id").range(d, f);
        if (lot) q = q.in("coproprieteId", [...lot]);
        return q;
      }),
    );
    const batParCopro = new Map<string, Batiment[]>();
    for (const b of batiments) {
      const code = ref.codeParId.get(b.coproprieteId) ?? b.coproprieteId;
      const liste = batParCopro.get(b.coproprieteId) ?? [];
      liste.push(batimentDepuisRow(b, code));
      batParCopro.set(b.coproprieteId, liste);
    }
    const out = new Map<string, FicheImmeuble>();
    for (const id of new Set([...meta.keys(), ...batParCopro.keys()])) {
      const code = ref.codeParId.get(id) ?? id;
      out.set(code, ficheDepuis(code, meta.get(id), batParCopro.get(id) ?? []));
    }
    return out;
  }

  async sauverFicheImmeuble(coproCode: string, patch: PatchFicheImmeuble): Promise<void> {
    const sb = createSupabasePublicClient();
    const contexte = `Fiche immeuble de ${coproCode}`;
    const id = await idCoproUnique(sb, coproCode, contexte);
    await this.upsertMetadata(sb, id, colonnesDepuisPatchFiche(patch), contexte);
  }

  /** BuildingMetadata est 1:1 par copro : update si la ligne existe, sinon insert. */
  private async upsertMetadata(sb: Sb, coproId: string, colonnes: Record<string, unknown>, contexte: string): Promise<void> {
    const { data: existante, error: errLecture } = await sb.from("BuildingMetadata").select("id").eq("coproprieteId", coproId).maybeSingle();
    if (errLecture) lever(contexte, errLecture);
    if (existante) {
      if (Object.keys(colonnes).length === 0) return;
      const { data, error } = await sb
        .from("BuildingMetadata")
        .update({ ...colonnes, updatedAt: maintenant() })
        .eq("id", (existante as { id: string }).id)
        .select("id");
      exigerUneLigne(contexte, data, error);
      return;
    }
    const { error } = await sb.from("BuildingMetadata").insert({ id: crypto.randomUUID(), coproprieteId: coproId, ...colonnes, updatedAt: maintenant() });
    if (error) lever(contexte, error);
  }

  async creerBatiment(b: NouveauBatiment): Promise<Batiment> {
    const sb = createSupabasePublicClient();
    const contexte = `Création du bâtiment « ${b.nom} » pour ${b.coproCode}`;
    const coproId = await idCoproUnique(sb, b.coproCode, contexte);
    const { data, error } = await sb
      .from("Building")
      .insert({ id: crypto.randomUUID(), coproprieteId: coproId, ...colonnesDepuisBatiment(b) })
      .select(COLS_BUILDING)
      .single();
    if (error) lever(contexte, error);
    return batimentDepuisRow(data as unknown as BuildingRow, b.coproCode);
  }

  async sauverBatiment(b: Batiment): Promise<void> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from("Building").update(colonnesDepuisBatiment(b)).eq("id", b.id).select("id");
    exigerUneLigne(`Enregistrement du bâtiment ${b.id}`, data, error);
  }

  /** Building n'a pas de suppression logique : la ligne est retirée. */
  async supprimerBatiment(id: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from("Building").delete().eq("id", id).select("id");
    exigerUneLigne(`Suppression du bâtiment ${id}`, data, error);
  }
}
