import { describe, it, expect } from "vitest";
import type { LigneComptable } from "./comptabilite";
import {
  composerDashboardComptable,
  filtrerComptable,
  gestionnairesDistincts,
  moisDistincts,
} from "./comptabilite";

function ligne(p: Partial<LigneComptable>): LigneComptable {
  return {
    coproCode: "S001",
    coproNom: "Copro",
    agDate: "2026-06-01",
    statutConfirmation: "a_confirmer",
    comptesVerifies: false,
    envoyerAvant: false,
    notesOuvertes: 0,
    ...p,
  };
}

describe("composerDashboardComptable", () => {
  const today = "2026-06-01";

  it("groupe confirmees vs a confirmer et exclut les AG passees", () => {
    const lignes = [
      ligne({ coproCode: "S010", agDate: "2026-05-01", statutConfirmation: "confirme" }), // passee -> exclue
      ligne({ coproCode: "S020", agDate: "2026-07-10", statutConfirmation: "confirme" }),
      ligne({ coproCode: "S030", agDate: "2026-06-15", statutConfirmation: "a_confirmer" }),
    ];
    const d = composerDashboardComptable(lignes, today);
    expect(d.confirmees.map((l) => l.coproCode)).toEqual(["S020"]);
    expect(d.aConfirmer.map((l) => l.coproCode)).toEqual(["S030"]);
  });

  it("trie chaque groupe par date croissante (plus proche en premier)", () => {
    const lignes = [
      ligne({ coproCode: "S003", agDate: "2026-09-01", statutConfirmation: "confirme" }),
      ligne({ coproCode: "S001", agDate: "2026-06-10", statutConfirmation: "confirme" }),
      ligne({ coproCode: "S002", agDate: "2026-07-05", statutConfirmation: "confirme" }),
    ];
    const d = composerDashboardComptable(lignes, today);
    expect(d.confirmees.map((l) => l.agDate)).toEqual(["2026-06-10", "2026-07-05", "2026-09-01"]);
  });

  it("preserve l'etat compta (flags / notes) sur la ligne groupee", () => {
    const lignes = [
      ligne({
        coproCode: "S042",
        agDate: "2026-06-20",
        statutConfirmation: "confirme",
        comptesVerifies: true,
        envoyerAvant: true,
        notesOuvertes: 3,
      }),
    ];
    const [l] = composerDashboardComptable(lignes, today).confirmees;
    expect(l).toMatchObject({ comptesVerifies: true, envoyerAvant: true, notesOuvertes: 3 });
  });
});

describe("filtrerComptable", () => {
  const lignes = [
    ligne({ coproCode: "A", gestionnaireNom: "Élise Lambert", agDate: "2026-06-10" }),
    ligne({ coproCode: "B", gestionnaireNom: "Farid Amrani", agDate: "2026-07-10" }),
    ligne({ coproCode: "C", gestionnaireNom: "Élise Lambert", agDate: "2026-07-25" }),
  ];

  it("filtre par gestionnaire", () => {
    expect(filtrerComptable(lignes, { gestionnaire: "Élise Lambert" }).map((l) => l.coproCode)).toEqual([
      "A",
      "C",
    ]);
  });

  it("filtre par mois d'AG", () => {
    expect(filtrerComptable(lignes, { mois: "2026-07" }).map((l) => l.coproCode)).toEqual(["B", "C"]);
  });

  it("combine gestionnaire + mois", () => {
    expect(
      filtrerComptable(lignes, { gestionnaire: "Élise Lambert", mois: "2026-07" }).map((l) => l.coproCode),
    ).toEqual(["C"]);
  });

  it("aucun filtre -> tout", () => {
    expect(filtrerComptable(lignes, {})).toHaveLength(3);
  });
});

describe("options de filtre", () => {
  const lignes = [
    ligne({ gestionnaireNom: "Farid Amrani", agDate: "2026-07-10" }),
    ligne({ gestionnaireNom: "Élise Lambert", agDate: "2026-06-10" }),
    ligne({ gestionnaireNom: undefined, agDate: "2026-06-25" }),
  ];

  it("gestionnairesDistincts : uniques, tries, sans les indefinis", () => {
    expect(gestionnairesDistincts(lignes)).toEqual(["Élise Lambert", "Farid Amrani"]);
  });

  it("moisDistincts : uniques et tries", () => {
    expect(moisDistincts(lignes)).toEqual(["2026-06", "2026-07"]);
  });
});
