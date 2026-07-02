// Tests de l'adapter REEL : on MOCKE estaleGql (aucun reseau). Chaque test verifie que la
// bonne mutation est envoyee avec les bonnes variables, et que l'ID/ref retourne est bien
// capture. AUCUN appel reel a eStale (le module client est entierement mocke).

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock du client eStale : estaleGql est une fonction espionne, estaleConfigure inerte.
vi.mock("@/lib/adapters/estale/client", () => ({
  estaleGql: vi.fn(),
  estaleConfigure: vi.fn(() => true),
}));

import { estaleGql } from "@/lib/adapters/estale/client";
import { ReelEstaleEcritureProvider } from "../reel-provider";
import type {
  CondoCreateInputEstale,
  LotInputEstale,
  DKInputEstale,
  OwnerInputEstale,
  AddressInputEstale,
  LotOwnerInputEstale,
} from "@/lib/reprise/ports/estale-ecriture-provider";

const gql = vi.mocked(estaleGql);

/** Recupere (query, variables) du dernier appel a estaleGql. */
function dernierAppel() {
  const call = gql.mock.calls.at(-1);
  if (!call) throw new Error("estaleGql n'a pas ete appele");
  return { query: call[0] as string, variables: call[1] as Record<string, unknown> };
}

describe("ReelEstaleEcritureProvider (estaleGql mocke, aucun reseau)", () => {
  beforeEach(() => {
    gql.mockReset();
  });

  it("creerCopro : mutation createCondo + input + capture l'id", async () => {
    gql.mockResolvedValueOnce({ createCondo: { id: "condo-42" } });
    const p = new ReelEstaleEcritureProvider();
    const input: CondoCreateInputEstale = {
      name: "Residence Foch",
      reference: "S0999",
      management: "CONDO",
      establishmentID: "153e3cc2-7158-4bbe-abef-b2cd815b2742",
      address: { postcode: "31000", city: "Toulouse", country: "France" },
    };

    const res = await p.creerCopro(input);

    expect(res).toEqual({ id: "condo-42" });
    const { query, variables } = dernierAppel();
    expect(query).toContain("createCondo");
    expect(query).toContain("CondoCreateInput!");
    expect(variables).toEqual({ input });
  });

  it("creerLot : mutation createLot + condoID/input + capture id+reference", async () => {
    gql.mockResolvedValueOnce({ createLot: { id: "lot-1", reference: "L001" } });
    const p = new ReelEstaleEcritureProvider();
    const input: LotInputEstale = { type: "Appartement", use: "RESIDENTIAL", num: "1" };

    const res = await p.creerLot("condo-42", input);

    expect(res).toEqual({ id: "lot-1", reference: "L001" });
    const { query, variables } = dernierAppel();
    expect(query).toContain("createLot");
    expect(query).toContain("LotInput!");
    expect(variables).toEqual({ condoID: "condo-42", input });
  });

  it("creerCle : mutation createDK + condoID/input + capture id+code", async () => {
    gql.mockResolvedValueOnce({ createDK: { id: "dk-1", code: "001" } });
    const p = new ReelEstaleEcritureProvider();
    const input: DKInputEstale = { name: "Charges generales", code: "001", tantieme: 1000 };

    const res = await p.creerCle("condo-42", input);

    expect(res).toEqual({ id: "dk-1", code: "001" });
    const { query, variables } = dernierAppel();
    expect(query).toContain("createDK");
    expect(query).toContain("DKInput!");
    expect(variables).toEqual({ condoID: "condo-42", input });
  });

  it("poserTantieme : mutation updateDK.upsertLot + dkID/lotID/share entier", async () => {
    gql.mockResolvedValueOnce({ updateDK: { upsertLot: { value: 450 } } });
    const p = new ReelEstaleEcritureProvider();

    await p.poserTantieme("dk-1", "lot-1", 450);

    const { query, variables } = dernierAppel();
    expect(query).toContain("updateDK");
    expect(query).toContain("upsertLot");
    expect(variables).toEqual({ dkID: "dk-1", lotID: "lot-1", share: 450 });
  });

  it("poserTantieme : arrondit le share a l'entier (Int! eStale)", async () => {
    gql.mockResolvedValueOnce({ updateDK: { upsertLot: { value: 33 } } });
    const p = new ReelEstaleEcritureProvider();

    await p.poserTantieme("dk-1", "lot-1", 33.33);

    expect(dernierAppel().variables).toEqual({ dkID: "dk-1", lotID: "lot-1", share: 33 });
  });

  it("creerOwner : mutation createOwner + condoID/input/address + capture id+reference", async () => {
    gql.mockResolvedValueOnce({ createOwner: { id: "own-1", reference: "O001" } });
    const p = new ReelEstaleEcritureProvider();
    const owner: OwnerInputEstale = { civility: "M", lastname: "DUPONT", resident: true };
    const address: AddressInputEstale = { postcode: "31000", city: "Toulouse", country: "France" };

    const res = await p.creerOwner("condo-42", owner, address);

    expect(res).toEqual({ id: "own-1", reference: "O001" });
    const { query, variables } = dernierAppel();
    expect(query).toContain("createOwner");
    expect(query).toContain("OwnerInput!");
    expect(query).toContain("AddressInput!");
    // Le port nomme les volets owner/address ; la mutation attend input/address.
    expect(variables).toEqual({ condoID: "condo-42", input: owner, address });
  });

  it("relierOwnerAuLot : mutation updateLot.upsertOwner + lotID/data", async () => {
    gql.mockResolvedValueOnce({ updateLot: { upsertOwner: { id: "link-1" } } });
    const p = new ReelEstaleEcritureProvider();
    const data: LotOwnerInputEstale[] = [
      { representative: true, division: "FREEHOLD", share: 100, ownerID: "own-1" },
    ];

    await p.relierOwnerAuLot("lot-1", data);

    const { query, variables } = dernierAppel();
    expect(query).toContain("updateLot");
    expect(query).toContain("upsertOwner");
    expect(query).toContain("LotOwnerInput!");
    expect(variables).toEqual({ lotID: "lot-1", data });
  });

  it("propage une erreur estaleGql sans l'avaler", async () => {
    gql.mockRejectedValueOnce(new Error("GraphQL Estale : boom"));
    const p = new ReelEstaleEcritureProvider();

    await expect(p.creerCopro({
      name: "X",
      reference: "S0",
      management: "CONDO",
      establishmentID: "153e3cc2-7158-4bbe-abef-b2cd815b2742",
      address: { postcode: "31000", city: "Toulouse", country: "France" },
    })).rejects.toThrow(/boom/);
  });
});
