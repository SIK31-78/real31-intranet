// Tests du domaine RGD : appariement ligne a ligne (compte, date, |ttc|) avec CONSOMMATION
// UNIQUE - deux montants identiques le meme jour ne se volent pas leur TVA. Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { LigneEcriture } from "../ecriture";
import { apparierRgdGl, type LigneRgd } from "../rgd";

const gl = (compte: string, date: string, montant: number, sens: "debit" | "credit" = "debit"): LigneEcriture => ({
  date,
  compte,
  libelle: "x",
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

describe("apparierRgdGl", () => {
  it("apparie sur (compte, date, |ttc|) et transporte la TVA", () => {
    const lignes = [gl("6060000", "2025-03-01", 120)];
    const rgd: LigneRgd[] = [{ date: "2025-03-01", compte: "6060000", ttc: 120, tva: 20, deductible: 20 }];
    const r = apparierRgdGl(lignes, rgd);
    expect(r.parIndexGl.get(0)?.tva).toBe(20);
    expect(r.residusGl).toEqual([]);
    expect(r.residusRgd).toEqual([]);
  });

  it("consommation UNIQUE : deux montants identiques le meme jour consomment deux lignes RGD", () => {
    const lignes = [gl("6060000", "2025-03-01", 120), gl("6060000", "2025-03-01", 120)];
    const rgd: LigneRgd[] = [
      { date: "2025-03-01", compte: "6060000", ttc: 120, tva: 20 },
      { date: "2025-03-01", compte: "6060000", ttc: 120, tva: 10 },
    ];
    const r = apparierRgdGl(lignes, rgd);
    // FIFO : chaque ligne GL consomme SA ligne RGD, pas deux fois la meme.
    expect(r.parIndexGl.get(0)?.tva).toBe(20);
    expect(r.parIndexGl.get(1)?.tva).toBe(10);
    expect(r.residusRgd).toEqual([]);
  });

  it("une extourne RGD (ttc negatif) s'apparie a la ligne credit du GL (|ttc| egal)", () => {
    const lignes = [gl("6060000", "2025-04-01", 50, "credit")];
    const rgd: LigneRgd[] = [{ date: "2025-04-01", compte: "6060000", ttc: -50, tva: -8.33 }];
    const r = apparierRgdGl(lignes, rgd);
    expect(r.parIndexGl.get(0)?.ttc).toBe(-50);
  });

  it("residus : GL sans RGD (travaux) et RGD sans GL (716) restent visibles", () => {
    const lignes = [gl("6710000", "2025-05-01", 900), gl("6060000", "2025-05-02", 10)];
    const rgd: LigneRgd[] = [
      { date: "2025-05-02", compte: "6060000", ttc: 10 },
      { date: "2025-05-03", compte: "7160000", ttc: 30 },
    ];
    const r = apparierRgdGl(lignes, rgd);
    expect(r.residusGl.map((x) => x.ligne.compte)).toEqual(["6710000"]);
    expect(r.residusRgd.map((x) => x.compte)).toEqual(["7160000"]);
  });

  it("ignore les lignes GL hors classe 6", () => {
    const lignes = [gl("4500001", "2025-03-01", 120)];
    const rgd: LigneRgd[] = [{ date: "2025-03-01", compte: "4500001", ttc: 120 }];
    const r = apparierRgdGl(lignes, rgd);
    expect(r.parIndexGl.size).toBe(0);
    expect(r.residusRgd).toHaveLength(1);
  });
});
