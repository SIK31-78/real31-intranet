import { describe, expect, it } from "vitest";
import {
  formatTaux,
  proposerContratSyndic,
  propositionFraisPostaux,
  tauxRevalorisation,
} from "./proposition-contrat-syndic";

const bareme2026 = [
  { identifiantPrestation: "AGE", montantTtc: 40.8 },
  { identifiantPrestation: "AssExp", montantTtc: 137 },
  { identifiantPrestation: "CSSupp", montantTtc: 228 },
  { identifiantPrestation: "DepLieu", montantTtc: 95 },
];
// Le vrai barème 2027 du cabinet : +2 % sur toutes les lignes.
const bareme2027 = [
  { identifiantPrestation: "AGE", montantTtc: 41.62 },
  { identifiantPrestation: "AssExp", montantTtc: 139.74 },
  { identifiantPrestation: "CSSupp", montantTtc: 232.56 },
  { identifiantPrestation: "DepLieu", montantTtc: 96.9 },
];

describe("tauxRevalorisation", () => {
  it("lit les +2 % du barème 2027 du cabinet", () => {
    expect(tauxRevalorisation(bareme2026, bareme2027)).toBe(0.02);
  });

  it("résiste à une ligne retouchée à la main (on prend la médiane, pas une ligne)", () => {
    const avecAnomalie = [...bareme2027];
    avecAnomalie[0] = { identifiantPrestation: "AGE", montantTtc: 80 }; // doublée par erreur
    expect(tauxRevalorisation(bareme2026, avecAnomalie)).toBe(0.02);
  });

  it("ignore les prestations absentes d'un des deux barèmes", () => {
    const suivant = [...bareme2027, { identifiantPrestation: "NOUVELLE", montantTtc: 500 }];
    expect(tauxRevalorisation(bareme2026, suivant)).toBe(0.02);
  });

  it("rend null quand le barème suivant n'est pas ouvert (on n'invente pas)", () => {
    expect(tauxRevalorisation(bareme2026, [])).toBeNull();
    expect(tauxRevalorisation([], bareme2027)).toBeNull();
  });

  it("rend 0 quand le barème est reconduit sans hausse", () => {
    expect(tauxRevalorisation(bareme2026, bareme2026)).toBe(0);
  });
});

describe("proposerContratSyndic", () => {
  it("revalorise le contrat en cours du taux du barème", () => {
    const p = proposerContratSyndic(4800, 0.02);
    expect(p).toEqual({ montantTtc: 4896, taux: 0.02, tauxLibelle: "2 %" });
  });

  it("arrondit au centime", () => {
    expect(proposerContratSyndic(1234.56, 0.02)?.montantTtc).toBe(1259.25);
  });

  it("ne propose rien sans contrat connu, sans taux, ou à taux nul", () => {
    expect(proposerContratSyndic(undefined, 0.02)).toBeNull();
    expect(proposerContratSyndic(0, 0.02)).toBeNull();
    expect(proposerContratSyndic(4800, null)).toBeNull();
    expect(proposerContratSyndic(4800, 0)).toBeNull();
  });
});

describe("formatTaux", () => {
  it("écrit le taux à la française", () => {
    expect(formatTaux(0.02)).toBe("2 %");
    expect(formatTaux(0.025)).toBe("2,5 %");
  });
});

describe("propositionFraisPostaux", () => {
  it("propose le réel quand la copro est au forfait", () => {
    expect(propositionFraisPostaux(false)).toBe("Il est proposé de passer les frais postaux au réel.");
    expect(propositionFraisPostaux(undefined)).toBe("Il est proposé de passer les frais postaux au réel.");
  });

  it("ne propose rien quand elle y est déjà", () => {
    expect(propositionFraisPostaux(true)).toBe("");
  });
});
