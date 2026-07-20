import { describe, it, expect } from "vitest";
import { calculerHonorairesSinistre, DILIGENCES_SINISTRE } from "./honoraires-sinistre";

describe("calculerHonorairesSinistre", () => {
  it("somme les diligences retenues, converties en HT", () => {
    const r = calculerHonorairesSinistre([
      { cle: "dossierAssureur", tarifTtc: 150 },
      { cle: "deplacementLieux", tarifTtc: 120 },
    ]);

    expect(r.lignes).toHaveLength(2);
    expect(r.lignes[0]!.montantHt).toBeCloseTo(125, 5);
    expect(r.lignes[1]!.montantHt).toBeCloseTo(100, 5);
    expect(r.montantHt).toBeCloseTo(225, 5);
  });

  it("gere les 4 diligences", () => {
    const r = calculerHonorairesSinistre(
      DILIGENCES_SINISTRE.map((d) => ({ cle: d.cle, tarifTtc: 120 })),
    );
    expect(r.lignes).toHaveLength(4);
    expect(r.montantHt).toBeCloseTo(400, 5);
  });

  it("libelle chaque ligne depuis le catalogue metier", () => {
    const r = calculerHonorairesSinistre([{ cle: "assistanceExpertise", tarifTtc: 240 }]);
    expect(r.lignes[0]!.libelle).toBe("Assistance aux mesures d'expertises");
  });

  it("refuse de facturer si aucune diligence n'est retenue (vs facture vide du legacy)", () => {
    expect(() => calculerHonorairesSinistre([])).toThrow();
  });

  it("rejette un tarif negatif", () => {
    expect(() => calculerHonorairesSinistre([{ cle: "dossierAssureur", tarifTtc: -1 }])).toThrow();
  });
});
