import { afterEach, describe, expect, it, vi } from "vitest";

const signalements: unknown[] = [];
vi.mock("@/lib/observabilite", () => ({
  signalerException: (e: unknown) => {
    signalements.push(e);
  },
}));

import { echecDepuis, estTechnique, MESSAGE_TECHNIQUE, messageUtilisateur } from "./resultat";

afterEach(() => {
  signalements.length = 0;
  vi.restoreAllMocks();
});

describe("messageUtilisateur", () => {
  it("laisse passer un message metier, sans signalement", () => {
    for (const m of ["Copropriété hors du périmètre du gestionnaire.", "Facture déjà émise pour S001 (gestion_courante, 2026-T3) : rien n'a été créé en double.", "Retape le code de la copropriété pour confirmer."]) {
      expect(messageUtilisateur(new Error(m), "test")).toBe(m);
    }
    expect(signalements).toHaveLength(0);
  });
  it("remplace un message technique par une phrase neutre et le signale", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const techniques = [
      'Réaffectation de S302 : column "managerId" does not exist',
      "Creation facture : duplicate key value violates unique constraint",
      "Emission Pennylane : HTTP 500 Internal Server Error",
      "Lecture contrats gestion courante : JSON object requested, multiple (or no) rows returned",
      "PGRST102: All object keys must match",
      "fetch failed",
      "Cannot read properties of undefined (reading 'code')",
    ];
    for (const m of techniques) {
      expect(estTechnique(m), m).toBe(true);
      expect(messageUtilisateur(new Error(m), "test")).toBe(MESSAGE_TECHNIQUE);
    }
    expect(signalements).toHaveLength(techniques.length);
  });
  it("une erreur qui n'est pas une Error, ou sans message, est technique", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(echecDepuis("boom", "test")).toEqual({ ok: false, erreur: "boom" });
    expect(echecDepuis(new Error(""), "test")).toEqual({ ok: false, erreur: MESSAGE_TECHNIQUE });
  });
});
