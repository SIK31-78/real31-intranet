import { describe, expect, it } from "vitest";
import { jamaisEnvoyeeDansEstale } from "./saisie-estale";

const base = { statut: "facturee", coproEstale: true, saisie: false, erreur: false };

describe("jamaisEnvoyeeDansEstale", () => {
  it("repère une facture émise d'une copro ESTALE, sans écriture ni essai", () => {
    expect(jamaisEnvoyeeDansEstale(base)).toBe(true);
  });

  it("écarte les autres cas", () => {
    expect(jamaisEnvoyeeDansEstale({ ...base, saisie: true })).toBe(false);
    expect(jamaisEnvoyeeDansEstale({ ...base, erreur: true })).toBe(false); // déjà proposée au renvoi
    expect(jamaisEnvoyeeDansEstale({ ...base, coproEstale: false })).toBe(false); // copro Crypto
    expect(jamaisEnvoyeeDansEstale({ ...base, statut: "a_facturer" })).toBe(false);
  });
});
