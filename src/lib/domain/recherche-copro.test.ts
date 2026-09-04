// Tests de la recherche de copro (projection + filtre), logique PURE. Zero I/O.
//
// Regression verrouillee ici : la recherche ne remontait que le PORTEFEUILLE. Une copro
// tenue par une collegue devait sortir des resultats, avec le nom du gestionnaire - sans
// cette mention, on croit ouvrir sa propre copro.

import { describe, it, expect } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import { filtrerRecherche, projeterRecherche } from "@/lib/domain/recherche-copro";

function copro(code: string, nom: string, ville: string, gestionnaire?: string): Copropriete {
  return {
    code,
    source: "crypto",
    nom,
    adresse: { ligne1: "1 rue", codePostal: "31000", ville },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "mars 2018",
    equipe: [
      ...(gestionnaire
        ? [{ initiales: "XX", nomComplet: gestionnaire, role: "gestionnaire" as const }]
        : []),
      { initiales: "PV", nomComplet: "Pauline Vidal", role: "comptable" as const },
    ],
  };
}

const CABINET = [
  copro("S214", "Le Clos Fleuri", "Toulouse", "Fanny MOREAU"),
  copro("S104", "Les Marronniers", "Blagnac", "Emmanuel LOPES"),
  copro("S297", "Sans gestionnaire", "Colomiers"),
];

describe("projection des resultats de recherche", () => {
  it("nomme le gestionnaire des copros qui ne sont PAS dans le portefeuille", () => {
    const r = projeterRecherche(CABINET, new Set(["S104"]));

    expect(r.find((c) => c.code === "S214")?.gestionnaire).toBe("Fanny MOREAU");
  });

  it("ne met aucune mention sur ses propres copros (ce serait du bruit)", () => {
    const r = projeterRecherche(CABINET, new Set(["S104"]));

    expect(r.find((c) => c.code === "S104")?.gestionnaire).toBeUndefined();
  });

  it("garde la copro sans gestionnaire connu, sans mention inventee", () => {
    const r = projeterRecherche(CABINET, new Set());
    const orpheline = r.find((c) => c.code === "S297");

    expect(orpheline).toBeDefined();
    expect(orpheline?.gestionnaire).toBeUndefined();
  });

  it("remonte TOUT le perimetre de lecture, pas seulement le portefeuille", () => {
    // Le coeur de la plainte : portefeuille = 1 copro, la recherche en propose 3.
    expect(projeterRecherche(CABINET, new Set(["S104"]))).toHaveLength(3);
  });
});

describe("filtre de saisie", () => {
  const items = projeterRecherche(CABINET, new Set(["S104"]));

  it("trouve la copro d'une collegue par son code", () => {
    expect(filtrerRecherche(items, "s214").map((c) => c.code)).toEqual(["S214"]);
  });

  it("exige TOUS les termes (recherche 'et')", () => {
    expect(filtrerRecherche(items, "clos toulouse").map((c) => c.code)).toEqual(["S214"]);
    expect(filtrerRecherche(items, "clos blagnac")).toEqual([]);
  });

  it("trouve les copros d'une collegue par son NOM", () => {
    expect(filtrerRecherche(items, "fanny").map((c) => c.code)).toEqual(["S214"]);
  });

  it("ne cherche pas sur un gestionnaire masque (ses propres copros)", () => {
    // "Emmanuel LOPES" n'est pas projete sur S104 (c'est sa copro) : rien a matcher.
    expect(filtrerRecherche(items, "emmanuel")).toEqual([]);
  });

  it("requete vide = aucun resultat (la palette montre la navigation)", () => {
    expect(filtrerRecherche(items, "   ")).toEqual([]);
  });

  it("borne le nombre de resultats", () => {
    expect(filtrerRecherche(items, "s", 2)).toHaveLength(2);
  });
});
