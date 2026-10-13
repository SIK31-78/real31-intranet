import { afterEach, describe, expect, it, vi } from "vitest";
import { debutTri, lireRobotsFacture } from "./mail-gate";

afterEach(() => vi.unstubAllEnvs());

describe("debutTri (mise en service du tri)", () => {
  it("rend minuit heure de Paris, ete comme hiver", () => {
    vi.stubEnv("MAIL_TRI_DEPUIS", "2026-10-19");
    expect(debutTri()).toBe("2026-10-18T22:00:00Z");
    vi.stubEnv("MAIL_TRI_DEPUIS", "2026-12-01");
    expect(debutTri()).toBe("2026-11-30T23:00:00Z");
  });

  it("absente ou illisible : toute la reception", () => {
    vi.stubEnv("MAIL_TRI_DEPUIS", "");
    expect(debutTri()).toBeNull();
    vi.stubEnv("MAIL_TRI_DEPUIS", "19/10/2026");
    expect(debutTri()).toBeNull();
  });
});

describe("lireRobotsFacture (adresse factures ESTALE par agence)", () => {
  it("lit une adresse par agence, ignore les entrées invalides", () => {
    expect(lireRobotsFacture("HLS=AAA@invoice.estale.app, lgc=bbb@invoice.estale.app;ML=pas-une-adresse;=x@y.z")).toEqual({
      HLS: "aaa@invoice.estale.app",
      LGC: "bbb@invoice.estale.app",
    });
    expect(lireRobotsFacture("")).toEqual({});
  });
});
