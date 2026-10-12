import { beforeEach, describe, expect, it, vi } from "vitest";

const signaler = vi.fn();
vi.mock("@/lib/observabilite", () => ({ signaler: (...args: unknown[]) => signaler(...args) }));

const { signalerSiegeAgenceInconnu } = await import("./signaler-siege-agence");

beforeEach(() => {
  signaler.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("signalerSiegeAgenceInconnu", () => {
  it("ne signale rien pour une agence connue", () => {
    expect(signalerSiegeAgenceInconnu("LGC", { copro: "S159" })).toBeUndefined();
    expect(signaler).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  // Jamais un blanc silencieux (Sekou, 12/10/2026) : Sentry ET les logs serveur.
  it("signale une agence inconnue à Sentry et dans les logs", () => {
    const avert = signalerSiegeAgenceInconnu("BZS", { proposition: "p-1" });
    expect(avert).toBe("Adresse de l'agence BZS inconnue : à compléter avant envoi.");
    expect(signaler).toHaveBeenCalledWith(avert, expect.objectContaining({ source: "contrat" }));
    expect(console.warn).toHaveBeenCalled();
  });

  it("tague la copro quand il y en a une", () => {
    signalerSiegeAgenceInconnu("", { copro: "S300" });
    expect(signaler).toHaveBeenCalledWith(expect.stringMatching(/^Agence de la copropriété inconnue/), expect.objectContaining({ copro: "S300" }));
  });
});
