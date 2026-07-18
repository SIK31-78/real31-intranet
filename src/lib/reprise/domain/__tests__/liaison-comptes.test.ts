// Tests du domaine PUR liaison-comptes : rapprochement owners <-> comptes 450 de l'ancien syndic.
// Tous les noms sont SYNTHETIQUES (inventes) - aucune donnee reelle, aucun nom en clair attendu
// dans les warnings (regle PII : ownerId + numeros de compte + scores uniquement).
import { describe, expect, it } from "vitest";
import {
  comptes450DeIntitules,
  lierOwnersComptes,
  nomOwner,
  trancherLiaison,
  type Compte450,
} from "../liaison-comptes";
import type { Owner } from "../patrimoine";

function owner(id: string, nom: string, prenom?: string): Owner {
  return { id, civilite: "m", nom, ...(prenom ? { prenom } : {}), pro: false };
}

describe("comptes450DeIntitules", () => {
  it("ne garde que les comptes de classe 450 (coproprietaires)", () => {
    const res = comptes450DeIntitules({
      "4501.100": "MARTIN PAUL",
      "4010.200": "ACME NETTOYAGE", // fournisseur -> exclu
      "6220000": "ENTRETIEN", // charge -> exclu
      "4502.300": "", // vide -> exclu
    });
    expect(res).toEqual([{ compte: "4501.100", intitule: "MARTIN PAUL" }]);
  });

  it("tolere l'absence d'intitules", () => {
    expect(comptes450DeIntitules(undefined)).toEqual([]);
  });
});

describe("lierOwnersComptes", () => {
  const comptes: Compte450[] = [
    { compte: "4501.100", intitule: "MARTIN PAUL" },
    { compte: "4501.200", intitule: "NOVAK ELENA" },
  ];

  it("lie un owner a son compte 450 quand l'appariement est fort et non ambigu", () => {
    const res = lierOwnersComptes([owner("o1", "MARTIN", "Paul")], comptes);
    expect(res.liaisons[0]).toMatchObject({ ownerId: "o1", statut: "lie", compteSource: "4501.100" });
    expect(res.comptesNonLies).toEqual(["4501.200"]);
    expect(res.warnings).toHaveLength(0);
  });

  it("marque non_trouve quand aucun compte ne correspond", () => {
    const res = lierOwnersComptes([owner("o9", "INCONNU", "Zoe")], comptes);
    expect(res.liaisons[0]!.statut).toBe("non_trouve");
    expect(res.comptesNonLies).toHaveLength(2);
  });

  it("force ambigu (jamais lie) quand le grand livre a des comptes 450 homonymes", () => {
    const homonymes: Compte450[] = [
      { compte: "4501.100", intitule: "DURAND JEANNE" },
      { compte: "4501.200", intitule: "DURAND JEANNE" },
    ];
    const res = lierOwnersComptes([owner("o1", "DURAND", "Jeanne")], homonymes);
    const l = res.liaisons[0]!;
    expect(l.statut).toBe("ambigu");
    expect(l.groupeHomonyme).toBe(true);
    expect(l.candidats?.length).toBeGreaterThanOrEqual(2);
    // warning PII-free : ownerId, pas de nom.
    expect(res.warnings.join(" ")).toContain("o1");
    expect(res.warnings.join(" ")).not.toMatch(/durand/i);
  });

  it("retrograde en ambigu une collision (deux owners visant le meme compte)", () => {
    // Deux owners au meme nom -> tous deux apparient fortement le meme compte -> collision.
    const res = lierOwnersComptes(
      [owner("o1", "MARTIN", "Paul"), owner("o2", "MARTIN", "Paul")],
      [{ compte: "4501.100", intitule: "MARTIN PAUL" }],
    );
    expect(res.liaisons.every((l) => l.statut === "ambigu")).toBe(true);
    expect(res.comptesNonLies).toEqual(["4501.100"]);
  });

  it("PII : aucun nom en clair dans les warnings", () => {
    const res = lierOwnersComptes(
      [owner("o1", "DURAND", "Jeanne")],
      [
        { compte: "4501.100", intitule: "DURAND JEANNE" },
        { compte: "4501.200", intitule: "DURAND JEANNE" },
      ],
    );
    for (const w of res.warnings) expect(w).not.toMatch(/durand|jeanne/i);
  });
});

describe("nomOwner", () => {
  it("concatene nom + prenom, tolere l'absence de prenom", () => {
    expect(nomOwner(owner("o1", "MARTIN", "Paul"))).toBe("MARTIN Paul");
    expect(nomOwner(owner("o2", "SCI BELLEVUE"))).toBe("SCI BELLEVUE");
  });
});

describe("trancherLiaison", () => {
  const base = [
    { ownerId: "o1", statut: "ambigu" as const, candidats: [{ compteSource: "4501.100", confiance: 0.7 }] },
    { ownerId: "o2", statut: "lie" as const, compteSource: "4501.200" },
  ];

  it("rattache le compte choisi et marque la liaison tranchee", () => {
    const res = trancherLiaison(base, "o1", "4501.100");
    expect(res[0]).toMatchObject({ ownerId: "o1", statut: "lie", compteSource: "4501.100", tranchee: true, confiance: 0.7 });
    expect(res[1]).toEqual(base[1]); // l'autre owner intact
  });

  it("dissocie (sans compte) quand le compte est vide", () => {
    const res = trancherLiaison(base, "o1", null);
    expect(res[0]).toMatchObject({ ownerId: "o1", statut: "non_trouve", tranchee: true });
    expect(res[0]!.compteSource).toBeUndefined();
  });
});
