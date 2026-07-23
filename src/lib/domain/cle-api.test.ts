// Tests du domaine des cles API : scopes, validite (expiration / revocation),
// regle "toute ecriture exige un gestionnaire", compteur journalier. 100 % offline.

import { describe, expect, it } from "vitest";
import {
  estScopeApi,
  estScopeEcriture,
  scopeAutorise,
  usageApresRequete,
  verifierAcces,
  verifierValidite,
} from "./cle-api";

const NOW = "2026-07-23T10:00:00.000Z";

describe("scopes", () => {
  it("reconnait les scopes connus et rejette le reste", () => {
    expect(estScopeApi("lecture")).toBe(true);
    expect(estScopeApi("ecriture:supervision")).toBe(true);
    expect(estScopeApi("ecriture:compta")).toBe(true);
    expect(estScopeApi("admin")).toBe(false);
    expect(estScopeApi("")).toBe(false);
  });

  it("distingue lecture et ecriture", () => {
    expect(estScopeEcriture("lecture")).toBe(false);
    expect(estScopeEcriture("ecriture:supervision")).toBe(true);
    expect(estScopeEcriture("ecriture:compta")).toBe(true);
  });

  it("scopeAutorise : exact, sans implication entre scopes", () => {
    expect(scopeAutorise(["lecture"], "lecture")).toBe(true);
    expect(scopeAutorise(["lecture"], "ecriture:compta")).toBe(false);
    // Une ecriture n'implique PAS la lecture.
    expect(scopeAutorise(["ecriture:compta"], "lecture")).toBe(false);
    expect(scopeAutorise(["lecture", "ecriture:compta"], "ecriture:compta")).toBe(true);
  });
});

describe("validite (revocation / expiration)", () => {
  it("cle saine -> ok", () => {
    expect(verifierValidite({}, NOW)).toEqual({ ok: true });
  });

  it("cle revoquee -> refus, meme si l'expiration est lointaine", () => {
    expect(verifierValidite({ revokedAt: "2026-01-01T00:00:00Z", expiresAt: "2030-01-01T00:00:00Z" }, NOW)).toEqual({
      ok: false,
      refus: "cle_revoquee",
    });
  });

  it("cle expiree -> refus ; expiration future -> ok", () => {
    expect(verifierValidite({ expiresAt: "2026-07-23T09:59:59.000Z" }, NOW)).toEqual({
      ok: false,
      refus: "cle_expiree",
    });
    expect(verifierValidite({ expiresAt: "2026-07-24T00:00:00.000Z" }, NOW)).toEqual({ ok: true });
  });
});

describe("verifierAcces (le verdict complet)", () => {
  it("lecture avec une cle cabinet (sans gestionnaire) -> ok (transverse)", () => {
    expect(verifierAcces({ scopes: ["lecture"] }, "lecture", NOW)).toEqual({ ok: true });
  });

  it("scope manquant -> refus", () => {
    expect(verifierAcces({ scopes: ["lecture"] }, "ecriture:supervision", NOW)).toEqual({
      ok: false,
      refus: "scope_manquant",
    });
  });

  it("ECRITURE avec une cle cabinet -> refus meme si le scope est porte", () => {
    expect(verifierAcces({ scopes: ["ecriture:compta"] }, "ecriture:compta", NOW)).toEqual({
      ok: false,
      refus: "ecriture_exige_gestionnaire",
    });
  });

  it("ecriture avec une cle liee a un gestionnaire -> ok", () => {
    expect(
      verifierAcces({ scopes: ["ecriture:compta"], managerId: "el" }, "ecriture:compta", NOW),
    ).toEqual({ ok: true });
  });

  it("la revocation prime sur tout", () => {
    expect(
      verifierAcces(
        { scopes: ["lecture"], managerId: "el", revokedAt: "2026-01-01T00:00:00Z" },
        "lecture",
        NOW,
      ),
    ).toEqual({ ok: false, refus: "cle_revoquee" });
  });
});

describe("compteur journalier", () => {
  it("meme jour -> incremente ; autre jour -> repart a 1", () => {
    expect(usageApresRequete({ usageJour: 4, usageJourDate: "2026-07-23" }, "2026-07-23")).toEqual({
      usageJour: 5,
      usageJourDate: "2026-07-23",
    });
    expect(usageApresRequete({ usageJour: 4, usageJourDate: "2026-07-22" }, "2026-07-23")).toEqual({
      usageJour: 1,
      usageJourDate: "2026-07-23",
    });
    expect(usageApresRequete({ usageJour: 0 }, "2026-07-23")).toEqual({
      usageJour: 1,
      usageJourDate: "2026-07-23",
    });
  });
});
