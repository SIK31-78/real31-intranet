import { describe, expect, it } from "vitest";
import { lireOptionsOffre, queryOffre } from "./options";

describe("options de l'offre dans l'URL", () => {
  it("une date absente est laissee au calcul, une date videe part en blanc", () => {
    expect(lireOptionsOffre({})).toEqual({});
    expect(lireOptionsOffre({ ag: "", debut: "2027-01-01", duree: "24" })).toEqual({ dateAgISO: "", debutISO: "2027-01-01", dureeMois: 24 });
    expect(lireOptionsOffre({ ag: "20/11/2026", duree: "" })).toEqual({});
  });
  it("la query repasse les dates videes, pas les absentes", () => {
    expect(queryOffre({})).toBe("");
    expect(queryOffre({ ag: "", duree: "12" })).toBe("?ag=&duree=12");
  });
});
