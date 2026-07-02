// Port (contrat) d'ECRITURE eStale, bas-niveau : une methode par mutation du patrimoine.
// Le service d'injection ne connait QUE ce contrat ; il ignore le client GraphQL concret.
//
// Ordre d'import impose par eStale (cf. docs/reprise-copro-integration-proposition.md section 4) :
//   lots -> cles -> tantiemes -> owners -> links.
//
// Les shapes d'input sont RE-DECLAREES ici cote reprise : le port ne depend PAS du schema
// eStale (pas d'import de types generes). Le mapping domaine -> ces inputs vit dans le service.
// Aucune de ces methodes ne suppose un transport reseau : un adapter dry-run les satisfait
// sans le moindre appel externe.

/**
 * Categorie de lot cote eStale (enum LotCategory).
 * Valeurs verifiees dans docs/estale-schema.json (2026-07-01).
 */
export type LotCategoryEstale =
  | "RESIDENTIAL"
  | "OFFICE"
  | "COMMERCIAL"
  | "MIXED"
  | "PARKING"
  | "OTHER"
  | "EXTERNAL"
  | "PRIMARY"
  | "SECONDARY";

/**
 * Civilite cote eStale (enum Civility).
 * Valeurs verifiees dans docs/estale-schema.json (2026-07-01).
 */
export type CivilityEstale =
  | "M"
  | "MM"
  | "MME"
  | "MMES"
  | "MandMME"
  | "MorMME"
  | "DOCTOR"
  | "DOCTORS"
  | "MASTER"
  | "MASTERS"
  | "PROFESSOR"
  | "PROFESSORS"
  | "INDIVISION"
  | "INHERITANCE"
  | "SDC"
  | "ASL"
  | "AFUL";

/**
 * Nature de la detention d'un lot par un owner (enum LotDivision).
 * Valeurs verifiees dans docs/estale-schema.json (2026-07-01).
 * FREEHOLD = pleine propriete, USUFRUCT = usufruit, BAREOWNER = nue-propriete.
 */
export type LotDivisionEstale = "FREEHOLD" | "USUFRUCT" | "BAREOWNER";

/** Entree de createLot(condoID, LotInput). */
export interface LotInputEstale {
  buildingID?: string;
  staircase?: string;
  floor?: number;
  door?: string;
  type: string;
  use: LotCategoryEstale;
  num: string;
  size?: number;
  rooms?: number;
  comment?: string;
}

/** Entree de createDK(condoID, DKInput). tantieme = TOTAL de la cle (pas par lot). */
export interface DKInputEstale {
  name: string;
  code: string;
  comment?: string;
  tantieme: number;
}

/** Entree de createOwner(condoID, OwnerInput, AddressInput) - volet identite. */
export interface OwnerInputEstale {
  civility: CivilityEstale;
  firstname?: string;
  lastname: string;
  birthDate?: string;
  birthPlace?: string;
  birthCountry?: string;
  companyName?: string;
  companyForm?: string;
  companySiret?: string;
  companyCapital?: number;
  email?: string;
  phone?: string;
  mobile?: string;
  resident: boolean;
  buyerID?: string;
}

/** Entree de createOwner(condoID, OwnerInput, AddressInput) - volet adresse. */
export interface AddressInputEstale {
  label?: string;
  housenumber?: string;
  street?: string;
  addressL2?: string;
  addressL3?: string;
  postcode: string;
  city: string;
  country: string;
  position?: string;
}

/** Entree du lien lot<->owner (upsertOwner(data: [LotOwnerInput!]!)). */
export interface LotOwnerInputEstale {
  representative: boolean;
  division: LotDivisionEstale;
  share: number;
  ownerID: string;
}

/**
 * Type de gestion d'une copro cote eStale (enum CondoManagement).
 * CONDO = copropriete (defaut), AS = association syndicale, AFU = association fonciere urbaine.
 */
export type CondoManagementEstale = "CONDO" | "AS" | "AFU";

/**
 * Entree de createCondo(CondoCreateInput). establishmentID = l'un des 4 etablissements
 * REAL31 (cf. domain/etablissements.ts). address : postcode/city/country obligatoires.
 */
export interface CondoCreateInputEstale {
  name: string;
  reference: string;
  management: CondoManagementEstale;
  establishmentID: string;
  address: AddressInputEstale;
}

/**
 * Contrat bas-niveau d'ecriture eStale. Une methode = une mutation ; chaque creation
 * retourne l'ID (et la reference/code) capture pour cabler les etapes suivantes.
 * L'implementation reelle enchainera les objets-mutation eStale (updateDK/updateLot) ;
 * le port n'expose que le resultat utile a l'orchestration.
 */
export interface EstaleEcritureProvider {
  /**
   * createCondo(CondoCreateInput) -> Condo! (on capture l'id). Cree la copro AVANT toute
   * injection de patrimoine : le condoID retourne alimente ensuite lots/cles/owners.
   */
  creerCopro(input: CondoCreateInputEstale): Promise<{ id: string }>;

  /** createLot(condoID, LotInput) -> Lot! (on capture id + reference). */
  creerLot(condoID: string, input: LotInputEstale): Promise<{ id: string; reference: string }>;

  /** createDK(condoID, DKInput) -> DistributionKeys! (on capture id + code). */
  creerCle(condoID: string, input: DKInputEstale): Promise<{ id: string; code: string }>;

  /** updateDK(dkID).upsertLot(lotID, share) : pose un tantieme granulaire (un appel par (cle, lot)). */
  poserTantieme(dkID: string, lotID: string, share: number): Promise<void>;

  /** createOwner(condoID, OwnerInput, AddressInput) -> Owner! (on capture id + reference). */
  creerOwner(
    condoID: string,
    owner: OwnerInputEstale,
    address: AddressInputEstale,
  ): Promise<{ id: string; reference: string }>;

  /** updateLot(lotID).upsertOwner(data) : relie un ou plusieurs owners a un lot. */
  relierOwnerAuLot(lotID: string, data: LotOwnerInputEstale[]): Promise<void>;
}
