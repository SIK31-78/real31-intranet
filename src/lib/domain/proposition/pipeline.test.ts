import { describe, expect, it } from "vitest";
import { anneesDistinctes, filtrer, transformation, trier } from "./pipeline";
import type { Proposition, StatutProposition } from "./proposition";

function prop(n: number, statut: StatutProposition, extra: Partial<Proposition> = {}): Proposition {
  return {
    id: `p${n}`,
    statut,
    immeuble: { adresse: `${n} rue de la Paix`, commune: "Colombes" },
    contact: { nom: `Contact ${n}` },
    prix: {},
    journal: [],
    creeParNom: "test",
    creeLeISO: "2026-01-01",
    majLeISO: "2026-01-01",
    ...extra,
  };
}

describe("transformation", () => {
  it("compte elues / (elues + refus CS + refus AG) sur 3 ans", () => {
    const t = transformation(
      [
        prop(1, "elu", { decisionISO: "2026-03-01" }),
        prop(2, "refuse_cs", { decisionISO: "2025-06-01" }),
        prop(3, "refuse_ag", { decisionISO: "2024-01-01" }),
        prop(4, "refuse_real31", { decisionISO: "2026-02-01" }), // ne compte pas
        prop(5, "elu", { decisionISO: "2022-01-01" }), // trop vieux
        prop(6, "en_cours"),
      ],
      "2026-09-15",
    );
    expect(t).toEqual({ depuisISO: "2023-09-15", elues: 1, decidees: 3, taux: 33 });
  });
  it("sans decision datee, prend le premier contact", () => {
    const t = transformation([prop(1, "elu", { premierContactISO: "2026-01-10" })], "2026-09-15");
    expect(t.elues).toBe(1);
  });
  it("null si rien de decide", () => {
    expect(transformation([prop(1, "en_cours")], "2026-09-15").taux).toBeNull();
  });
});

describe("filtrer", () => {
  const liste = [
    prop(1, "en_cours", { agence: "LGC", premierContactISO: "2026-05-01", origine: "internet", contact: { nom: "Mme Dupont" } }),
    prop(2, "elu", { agence: "ML", premierContactISO: "2025-05-01", gestionnaire: "Galiano" }),
    prop(3, "reporte", { agence: "LGC", premierContactISO: "2024-05-01", immeuble: { adresse: "3 avenue Foch", commune: "La Garenne-Colombes", immatriculation: "AB1234567" } }),
  ];
  it("ouvertes par defaut", () => {
    expect(filtrer(liste, {}).map((p) => p.id)).toEqual(["p1", "p3"]);
  });
  it("toutes, un statut, une agence, une annee, une origine, un gestionnaire", () => {
    expect(filtrer(liste, { statut: "toutes" })).toHaveLength(3);
    expect(filtrer(liste, { statut: "elu" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrer(liste, { statut: "toutes", agence: "LGC" })).toHaveLength(2);
    expect(filtrer(liste, { statut: "toutes", annee: 2025 }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrer(liste, { origine: "internet" }).map((p) => p.id)).toEqual(["p1"]);
    expect(filtrer(liste, { statut: "toutes", gestionnaire: "Galiano" }).map((p) => p.id)).toEqual(["p2"]);
  });
  it("texte libre sans accents : adresse, commune, contact, immatriculation", () => {
    expect(filtrer(liste, { texte: "foch garenne" }).map((p) => p.id)).toEqual(["p3"]);
    expect(filtrer(liste, { texte: "AB1234567" }).map((p) => p.id)).toEqual(["p3"]);
    expect(filtrer(liste, { texte: "dupont" }).map((p) => p.id)).toEqual(["p1"]);
  });
  it("texte libre : agence, gestionnaire, origine, statut, annee", () => {
    expect(filtrer(liste, { statut: "toutes", texte: "ML" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrer(liste, { statut: "toutes", texte: "galiano" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrer(liste, { texte: "internet" }).map((p) => p.id)).toEqual(["p1"]);
    expect(filtrer(liste, { statut: "toutes", texte: "élu" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrer(liste, { statut: "toutes", texte: "2024 LGC" }).map((p) => p.id)).toEqual(["p3"]);
  });
});

describe("trier", () => {
  const liste = [
    prop(1, "en_cours", { premierContactISO: "2026-05-01", immeuble: { adresse: "Zed", lotsPrincipaux: 5 }, prix: { honorairesTtc: 100 } }),
    prop(2, "en_cours", { premierContactISO: "2026-06-01", immeuble: { adresse: "Alpha", lotsPrincipaux: 50 } }),
  ];
  it("date desc par defaut, lots, honoraires (absent en dernier), adresse", () => {
    expect(trier(liste).map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(trier(liste, { cle: "lots", sens: "desc" }).map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(trier(liste, { cle: "honoraires", sens: "desc" }).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(trier(liste, { cle: "adresse", sens: "asc" }).map((p) => p.id)).toEqual(["p2", "p1"]);
  });
  it("annees distinctes, recentes d'abord", () => {
    expect(anneesDistinctes(liste)).toEqual([2026]);
  });
});
