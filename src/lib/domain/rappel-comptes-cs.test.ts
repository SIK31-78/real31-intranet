import { describe, expect, it } from "vitest";
import { cleRappelComptesCs, joursEntre, selectionnerRappelsComptesCs } from "./rappel-comptes-cs";

// REA-140 : rappel aux comptables a J-10 du CS, seulement si les comptes ne sont pas verifies.

const JOUR = "2026-10-12";
const copro = (code: string, csDate: string | null, comptesVerifies = false, agDate: string | null = "2026-12-01") => ({
  coproCode: code,
  coproNom: `Copro ${code}`,
  csDate,
  agDate,
  comptesVerifies,
});

describe("joursEntre", () => {
  it("compte les jours calendaires, heure ignoree, passage a l'heure d'hiver compris", () => {
    expect(joursEntre("2026-10-12", "2026-10-22")).toBe(10);
    expect(joursEntre("2026-10-12", "2026-10-22T18:30")).toBe(10);
    expect(joursEntre("2026-10-20", "2026-10-30")).toBe(10);
    expect(joursEntre("2026-10-12", "2026-10-11")).toBe(-1);
  });
});

describe("selectionnerRappelsComptesCs", () => {
  it("CS a J-10, comptes non verifies -> rappel", () => {
    const r = selectionnerRappelsComptesCs([copro("S1", "2026-10-22T18:00")], JOUR);
    expect(r).toEqual([
      {
        cle: cleRappelComptesCs("S1", "2026-10-22"),
        coproCode: "S1",
        coproNom: "Copro S1",
        csDate: "2026-10-22",
        agDate: "2026-12-01",
        joursAvant: 10,
      },
    ]);
  });

  it("comptes deja verifies -> aucun rappel", () => {
    expect(selectionnerRappelsComptesCs([copro("S1", "2026-10-22", true)], JOUR)).toEqual([]);
  });

  it("fenetre : de J-10 a J-1 (rattrapage), rien au-dela, ni le jour meme, ni apres", () => {
    const r = selectionnerRappelsComptesCs(
      [
        copro("A", "2026-10-23"),
        copro("B", "2026-10-22"),
        copro("C", "2026-10-13"),
        copro("D", "2026-10-12"),
        copro("E", "2026-10-01"),
        copro("F", null),
      ],
      JOUR,
    );
    expect(r.map((x) => [x.coproCode, x.joursAvant])).toEqual([
      ["C", 1],
      ["B", 10],
    ]);
  });

  it("sans AG datee : rappel quand meme, sans date d'AG", () => {
    const [r] = selectionnerRappelsComptesCs([copro("S1", "2026-10-20", false, null)], JOUR);
    expect(r.agDate).toBeNull();
  });

  it("la cle depend de la date du CS : un CS deplace est rappele a nouveau", () => {
    expect(cleRappelComptesCs("S1", "2026-10-22T18:00")).toBe("rappel-comptes-cs|S1|2026-10-22");
    expect(cleRappelComptesCs("S1", "2026-10-22")).not.toBe(cleRappelComptesCs("S1", "2026-10-23"));
  });
});
