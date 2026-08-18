// Tests de la derivation du journal eStale depuis la contrepartie (decision Sekou
// 2026-08-18 : les mouvements repris gardent leur nature ; seuls les cas qui TRANCHENT
// derivent, le reste rend null -> repli carryforward visible chez l'appelant).
import { describe, expect, it } from "vitest";
import { deriverJournal } from "../journal-reprise";

describe("deriverJournal", () => {
  it("tresorerie d'un cote ou de l'autre -> bank (la tresorerie prime)", () => {
    expect(deriverJournal("4500001", "512")).toBe("bank"); // encaissement copro
    expect(deriverJournal("4010001", "512")).toBe("bank"); // reglement fournisseur
    expect(deriverJournal("5120.000", "401001")).toBe("bank"); // vu du compte banque
    expect(deriverJournal("512", "502002")).toBe("bank"); // livret <-> banque
  });

  it("fournisseur contre charge -> purchase (les deux sens)", () => {
    expect(deriverJournal("4010.100", "602001")).toBe("purchase");
    expect(deriverJournal("6060.000", "401001")).toBe("purchase");
    expect(deriverJournal("4080000", "622")).toBe("purchase"); // FNP aussi
  });

  it("coproprietaire contre produit d'appel ou fonds travaux -> fundraising", () => {
    expect(deriverJournal("4501.100", "701")).toBe("fundraising");
    expect(deriverJournal("450001", "702001")).toBe("fundraising");
    expect(deriverJournal("450001", "105001")).toBe("fundraising"); // appel fonds travaux
    expect(deriverJournal("105001", "450001")).toBe("fundraising"); // vu du 105
  });

  it("ne tranche PAS -> null (le repli appartient a l'appelant, jamais ici)", () => {
    expect(deriverJournal("4501.100", undefined)).toBeNull(); // contrepartie absente
    expect(deriverJournal("4501.100", "")).toBeNull();
    expect(deriverJournal("450001", "471999")).toBeNull(); // compte d'attente : ambigu
    expect(deriverJournal("4010001", "401002")).toBeNull(); // fournisseur <-> fournisseur
    expect(deriverJournal("622", "701")).toBeNull(); // charge <-> produit : pas un motif connu
  });
});
