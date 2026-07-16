import { describe, expect, it } from "vitest";
import { avancement, creerDossier, etapesParDefaut, reconcilierEtapes, PHASES } from "../dossier";
import type { Etape } from "../dossier";

describe("dossier d'onboarding", () => {
  it("cree un dossier avec la checklist du pipeline reel (R1..R11)", () => {
    const d = creerDossier("S0302", "44 et 50 rue Gabriel Peri");
    expect(d.ref).toBe("S0302");
    expect(d.statut).toBe("production");
    const codes = d.etapes.map((e) => e.code);
    expect(codes).toContain("R1");
    expect(codes).toContain("R6");
    expect(codes).toContain("R11");
    expect(d.etapes).toHaveLength(11);
  });

  it("toutes les etapes referencent une phase connue", () => {
    for (const e of etapesParDefaut()) {
      expect(PHASES).toContain(e.phase);
    }
  });

  it("avancement = part des etapes faites/ignorees", () => {
    const d = creerDossier("S0303", "Test");
    expect(avancement(d)).toBe(0);
    d.etapes[0]!.statut = "fait";
    d.etapes[1]!.statut = "ignore";
    expect(avancement(d)).toBeCloseTo(2 / d.etapes.length);
  });
});

describe("reconcilierEtapes (migration douce)", () => {
  it("rehydrate une ancienne checklist P/V/C sur R1..R11 sans perdre les etats coches", () => {
    // Ancien dossier persiste : P3 fait, V1 ignore, C4 en_cours, le reste a_faire.
    const anciennes: Etape[] = [
      { code: "P1", phase: "PATRIMOINE", libelle: "Preparation", statut: "a_faire" },
      { code: "P3", phase: "PATRIMOINE", libelle: "Production", statut: "fait" },
      { code: "V1", phase: "VERIFICATION", libelle: "Apres lots", statut: "ignore" },
      { code: "C4", phase: "COMPTABILITE", libelle: "Ecritures 4/5/6", statut: "en_cours" },
      { code: "CLOTURE", phase: "MISE_EN_SERVICE", libelle: "Cloture", statut: "a_faire" },
    ];
    const reconc = reconcilierEtapes(anciennes);
    const codes = reconc.map((e) => e.code);
    // La checklist courante est presente en tete.
    expect(codes.slice(0, 11)).toEqual(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"]);
    // Les anciennes etapes COCHEES sont preservees (aucune perte d'etat) ; les a_faire droppees.
    const legacy = reconc.filter((e) => e.code.startsWith("R") === false);
    expect(legacy.map((e) => e.code).sort()).toEqual(["C4", "P3", "V1"]);
    expect(reconc.find((e) => e.code === "P3")!.statut).toBe("fait");
    expect(reconc.find((e) => e.code === "V1")!.statut).toBe("ignore");
    expect(reconc.find((e) => e.code === "C4")!.statut).toBe("en_cours");
  });

  it("est idempotente sur une checklist deja canonique et reporte les statuts R*", () => {
    const canon = etapesParDefaut();
    canon.find((e) => e.code === "R6")!.statut = "fait";
    const reconc = reconcilierEtapes(canon);
    expect(reconc).toHaveLength(11);
    expect(reconc.find((e) => e.code === "R6")!.statut).toBe("fait");
  });
});
