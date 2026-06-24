import { describe, expect, it } from "vitest";
import {
  phaseTerminee,
  type ItemChecklist,
  type SectionChecklist,
} from "./supervision-ag";

function section(items: Partial<ItemChecklist>[]): SectionChecklist {
  return {
    id: "s",
    titre: "S",
    items: items.map((i, n) => ({
      id: `i${n}`,
      libelle: `item ${n}`,
      statut: "non_verifie",
      ...i,
    })),
  };
}

describe("phaseTerminee (gating des paliers)", () => {
  it("vraie quand tout est OK ou N/A", () => {
    expect(phaseTerminee(section([{ statut: "ok" }, { statut: "non_applicable" }]))).toBe(true);
  });

  it("fausse si un item reste a verifier", () => {
    expect(phaseTerminee(section([{ statut: "ok" }, { statut: "non_verifie" }]))).toBe(false);
  });

  it("fausse si un item est en probleme (plus strict que la progression)", () => {
    expect(phaseTerminee(section([{ statut: "ok" }, { statut: "probleme" }]))).toBe(false);
  });

  it("item date : termine seulement si une date est renseignee", () => {
    expect(phaseTerminee(section([{ type: "date" }]))).toBe(false);
    expect(phaseTerminee(section([{ type: "date", commentaire: "2026-06-30" }]))).toBe(true);
  });

  it("vraie pour une phase vide (aucun item bloquant)", () => {
    expect(phaseTerminee(section([]))).toBe(true);
  });
});
