import { describe, expect, it } from "vitest";
import { dupliquerBareme, ecartAvecPrecedent, familleDe, identifiantsManquants, motifRefusMontant, rangerBareme } from "./bareme-admin";

const l = (id: string, m: number) => ({ identifiantPrestation: id, libelle: id, montantTtc: m });

describe("bareme-admin", () => {
  it("range par famille puis dans l'ordre du document", () => {
    const r = rangerBareme([l("TauxHoraire", 90), l("Zzz", 1), l("AGE", 40.8), l("ForfaitParLot", 202), l("ForfaitBase", 2899)]);
    expect(r.map((x) => `${x.famille}:${x.identifiantPrestation}`)).toEqual(["forfait:ForfaitBase", "forfait:ForfaitParLot", "contrat:AGE", "contrat:TauxHoraire", "autres:Zzz"]);
    expect(familleDe("AGE").famille).toBe("contrat");
  });
  it("sait ce qui manque a une annee", () => {
    expect(identifiantsManquants([l("AGE", 1)])).toContain("ForfaitBase");
    expect(identifiantsManquants([l("AGE", 1)])).not.toContain("AGE");
  });
  it("duplique sans ecraser, avec majoration au centime", () => {
    const r = dupliquerBareme([l("AGE", 40.8), l("MED", 100)], [l("MED", 120)], 2);
    expect(r).toEqual([l("AGE", 41.62)]);
  });
  it("une majoration ne depasse jamais le plafond legal de l'etat date (380 € TTC)", () => {
    expect(dupliquerBareme([l("EtatDate", 380), l("AGE", 100)], [], 2)).toEqual([l("EtatDate", 380), l("AGE", 102)]);
    expect(motifRefusMontant(390, "EtatDate")).toContain("plafonné");
    expect(motifRefusMontant(380, "EtatDate")).toBeNull();
    expect(motifRefusMontant(390, "AGE")).toBeNull();
  });
  it("arrondit a l'euro sur demande, sans jamais depasser le plafond legal", () => {
    const r = dupliquerBareme([l("AGE", 40.8), l("MED", 60), l("EtatDate", 380), l("RepriseCompta", 46.5)], [], 2, { arrondiEuro: true });
    expect(r).toEqual([l("AGE", 42), l("MED", 61), l("EtatDate", 380), l("RepriseCompta", 47)]);
    // Sans l'option : au centime, comme avant.
    expect(dupliquerBareme([l("AGE", 40.8)], [], 2)).toEqual([l("AGE", 41.62)]);
  });
  it("la relance simple est rangee avec les prestations hors contrat, sans etre exigee", () => {
    expect(familleDe("RelanceSimple").famille).toBe("prestations");
    expect(identifiantsManquants([l("AGE", 1)])).not.toContain("RelanceSimple");
    const r = rangerBareme([l("RelanceSimple", 7.2), l("TauxHoraire", 163.65), l("Opposition", 260)]);
    expect(r.map((x) => x.identifiantPrestation).at(-1)).toBe("RelanceSimple");
  });
  it("ecart avec l'annee precedente", () => {
    expect(ecartAvecPrecedent(l("AGE", 42), [l("AGE", 40)])).toBe(5);
    expect(ecartAvecPrecedent(l("AGE", 42), [])).toBeNull();
  });
  it("refuse un montant negatif ou illisible", () => {
    expect(motifRefusMontant(-1)).toMatch(/négatif/);
    expect(motifRefusMontant(Number.NaN)).toMatch(/illisible/);
    expect(motifRefusMontant(12.5)).toBeNull();
  });
});
