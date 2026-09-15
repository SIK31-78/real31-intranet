import { describe, expect, it } from "vitest";
import { arrondirDemiHeure, calculerPrestation, prestationContrat, PRESTATIONS_CONTRAT } from "./prestations-contrat";
import { PRESTATIONS_CONTRAT as IDENTIFIANTS_CONTRAT } from "../contrat/champs-contrat";

describe("catalogue des prestations du contrat", () => {
  it("chaque prestation pointe un identifiant que le contrat imprime (ou l'un des trois emprunts)", () => {
    const connus = new Set<string>([...IDENTIFIANTS_CONTRAT, "DossierEmpruntIII", "DossierEmpruntIIIGestion"]);
    for (const p of PRESTATIONS_CONTRAT) expect(connus.has(p.identifiantPrestation), p.code).toBe(true);
  });

  it("les codes sont uniques", () => {
    const codes = PRESTATIONS_CONTRAT.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("le recouvrement part sur « Relance sur charges impayées », le reste sur « Honoraires complémentaires »", () => {
    for (const p of PRESTATIONS_CONTRAT) {
      expect(p.categorieProduit).toBe(p.groupe === "recouvrement" ? "Relance sur charges impayées" : "Honoraires complémentaires");
    }
  });
});

describe("calculerPrestation", () => {
  it("fixe : le tarif, quantite 1", () => {
    const c = calculerPrestation({ prestation: prestationContrat("mise_en_demeure")!, tarifTtc: 60 });
    expect(c).toMatchObject({ quantite: 1, unite: null, unitaireTtc: 60, montantTtc: 60, montantHt: 50 });
  });

  it("au lot : 40,80 x 28 lots pour une AG supplementaire", () => {
    const c = calculerPrestation({ prestation: prestationContrat("ag_supplementaire")!, tarifTtc: 40.8, quantite: 28 });
    expect(c.montantTtc).toBeCloseTo(1142.4, 2);
    expect(c.montantHt).toBeCloseTo(952, 2);
    expect(c.unite).toMatch(/lot/);
  });

  it("au coproprietaire : 25,25 x 12", () => {
    const c = calculerPrestation({ prestation: prestationContrat("dossier_emprunt")!, tarifTtc: 25.25, quantite: 12 });
    expect(c.montantTtc).toBeCloseTo(303, 2);
  });

  it("a l'heure : arrondi a la demi-heure superieure, urgence +40 %", () => {
    expect(arrondirDemiHeure(1.1)).toBe(1.5);
    expect(arrondirDemiHeure(2)).toBe(2);
    expect(arrondirDemiHeure(0.5)).toBe(0.5);
    const p = prestationContrat("temps_passe")!;
    expect(calculerPrestation({ prestation: p, tarifTtc: 163.65, quantite: 1.1 }).montantTtc).toBeCloseTo(245.48, 2);
    const u = calculerPrestation({ prestation: p, tarifTtc: 163.65, quantite: 1, urgence: true });
    expect(u.majorationPct).toBe(0.4);
    expect(u.montantTtc).toBeCloseTo(229.11, 2);
  });

  it("l'urgence ne majore que le temps passe", () => {
    const c = calculerPrestation({ prestation: prestationContrat("hypotheque")!, tarifTtc: 453, urgence: true });
    expect(c.majorationPct).toBe(0);
  });

  it("refuse une quantite absente ou nulle quand le mode en demande une", () => {
    expect(() => calculerPrestation({ prestation: prestationContrat("ag_supplementaire")!, tarifTtc: 40.8 })).toThrow(/lot/);
    expect(() => calculerPrestation({ prestation: prestationContrat("temps_passe")!, tarifTtc: 163.65, quantite: 0 })).toThrow(/heure/);
  });
});
