// Adapter REEL du port EstaleEcritureProvider : chaque methode = UNE mutation GraphQL
// eStale, via le client authentifie estaleGql. C'est le SEUL fichier du module reprise
// qui connait estaleGql (hexagonal : l'UI/le service ignorent le transport).
//
// ATTENTION : ce provider ECRIT dans l'eStale de PRODUCTION du cabinet. Il n'est jamais
// instancie par defaut : le routeur (router.ts) ne le choisit que si ESTALE_ECRITURE=reel
// ET les identifiants eStale sont presents. Le DRY-RUN reste le defaut.
//
// Throttle : les tantiemes et les links sont granulaires (un appel par (cle,lot) et par
// lot) -> on peut enchainer des centaines d'appels. Le rate limit eStale est 50 req/s
// (ADR-022). On serialise donc tous les appels derriere un espacement minimal (~25 ms,
// soit <= 40 req/s), ce qui garde une marge sous la limite.

import { estaleGql } from "@/lib/adapters/estale/client";
import type {
  EstaleEcritureProvider,
  CondoCreateInputEstale,
  LotInputEstale,
  DKInputEstale,
  OwnerInputEstale,
  AddressInputEstale,
  LotOwnerInputEstale,
} from "@/lib/reprise/ports/estale-ecriture-provider";

// --- Mutations (verifiees ; NE PAS deviner) --------------------------------
const M_CREATE_CONDO = `mutation($input:CondoCreateInput!){ createCondo(input:$input){ id mainDKID } }`;
const M_CREATE_LOT = `mutation($condoID:ID!,$input:LotInput!){ createLot(condoID:$condoID,input:$input){ id reference } }`;
const M_CREATE_DK = `mutation($condoID:ID!,$input:DKInput!){ createDK(condoID:$condoID,input:$input){ id code } }`;
const M_UPSERT_TANTIEME = `mutation($dkID:ID!,$lotID:ID!,$share:Int!){ updateDK(id:$dkID){ upsertLot(lotID:$lotID,share:$share){ value } } }`;
const M_CREATE_OWNER = `mutation($condoID:ID!,$input:OwnerInput!,$address:AddressInput!){ createOwner(condoID:$condoID,input:$input,address:$address){ id reference } }`;
const M_UPSERT_OWNER = `mutation($lotID:ID!,$data:[LotOwnerInput!]!){ updateLot(id:$lotID){ upsertOwner(data:$data){ id } } }`;

// --- Throttle : token-bucket minimaliste (espacement minimal entre appels) --
/**
 * Espacement minimal entre deux appels reseau (ms). 25 ms => <= 40 req/s, sous le
 * plafond eStale de 50 req/s (ADR-022) avec une marge de securite.
 */
const ESPACEMENT_MIN_MS = 25;

/** Formes des reponses GraphQL (on ne lit que les champs utiles). */
type CreateCondoData = { createCondo: { id: string; mainDKID: string } };
type CreateLotData = { createLot: { id: string; reference: string } };
type CreateDKData = { createDK: { id: string; code: string } };
type UpsertTantiemeData = { updateDK: { upsertLot: { value: number } } };
type CreateOwnerData = { createOwner: { id: string; reference: string } };
type UpsertOwnerData = { updateLot: { upsertOwner: { id: string } } };

export class ReelEstaleEcritureProvider implements EstaleEcritureProvider {
  /** Timestamp du dernier appel emis, pour espacer le suivant. */
  private dernierAppel = 0;

  /**
   * Serialise chaque appel derriere un espacement minimal. Les appels s'enchainent
   * en file (le service les emet sequentiellement de toute facon) : on attend juste
   * que ESPACEMENT_MIN_MS se soit ecoule depuis le precedent avant de partir.
   */
  private async throttle(): Promise<void> {
    const maintenant = Date.now();
    const attente = this.dernierAppel + ESPACEMENT_MIN_MS - maintenant;
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    this.dernierAppel = Date.now();
  }

  /** Un appel GraphQL throttle. Les erreurs de estaleGql (EstaleError) remontent telles quelles. */
  private async appel<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    await this.throttle();
    return estaleGql<T>(query, variables);
  }

  async creerCopro(input: CondoCreateInputEstale): Promise<{ id: string; mainDKID: string }> {
    const data = await this.appel<CreateCondoData>(M_CREATE_CONDO, { input });
    return { id: data.createCondo.id, mainDKID: data.createCondo.mainDKID };
  }

  async creerLot(condoID: string, input: LotInputEstale): Promise<{ id: string; reference: string }> {
    const data = await this.appel<CreateLotData>(M_CREATE_LOT, { condoID, input });
    return { id: data.createLot.id, reference: data.createLot.reference };
  }

  async creerCle(condoID: string, input: DKInputEstale): Promise<{ id: string; code: string }> {
    const data = await this.appel<CreateDKData>(M_CREATE_DK, { condoID, input });
    return { id: data.createDK.id, code: data.createDK.code };
  }

  async poserTantieme(dkID: string, lotID: string, share: number): Promise<void> {
    // eStale attend un Int! : on borne au plus proche entier (les tantiemes sont entiers).
    await this.appel<UpsertTantiemeData>(M_UPSERT_TANTIEME, { dkID, lotID, share: Math.round(share) });
  }

  async creerOwner(
    condoID: string,
    owner: OwnerInputEstale,
    address: AddressInputEstale,
  ): Promise<{ id: string; reference: string }> {
    const data = await this.appel<CreateOwnerData>(M_CREATE_OWNER, {
      condoID,
      input: owner,
      address,
    });
    return { id: data.createOwner.id, reference: data.createOwner.reference };
  }

  async relierOwnerAuLot(lotID: string, data: LotOwnerInputEstale[]): Promise<void> {
    await this.appel<UpsertOwnerData>(M_UPSERT_OWNER, { lotID, data });
  }
}
