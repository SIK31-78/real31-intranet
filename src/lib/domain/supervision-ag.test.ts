import { describe, expect, it } from "vitest";
import {
  phaseTerminee,
  agDateDeAgId,
  coproCodeDeAgId,
  type ItemChecklist,
  type SectionChecklist,
} from "./supervision-ag";

describe("agId : copro + date (transition prochaine -> derniere AG a la conclusion)", () => {
  it("extrait copro ET date d'un agId 'CODE__YYYY-MM-DD'", () => {
    expect(coproCodeDeAgId("S122__2026-07-07")).toBe("S122");
    expect(agDateDeAgId("S122__2026-07-07")).toBe("2026-07-07");
  });

  it("agDateDeAgId renvoie null sans date valide (id simple ou format inattendu)", () => {
    expect(agDateDeAgId("S122")).toBeNull();
    expect(agDateDeAgId("e1")).toBeNull();
    expect(agDateDeAgId("S122__pas-une-date")).toBeNull();
  });
});

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
