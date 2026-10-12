import { describe, expect, it } from "vitest";
import type { Odj } from "./odj";
import { mailOdjAuConseil } from "./odj-mail-cs";

function odj(dateCs?: string, dateAg?: string): Pick<Odj, "copro" | "dateAg" | "enTete"> {
  return {
    copro: { code: "S146", nom: "Les Marronniers", adresse: "" },
    ...(dateAg ? { dateAg } : {}),
    enTete: dateCs ? [{ id: "date-cs", libelle: "Date du CS", source: "supabase", valeur: dateCs }] : [],
  };
}

describe("mailOdjAuConseil", () => {
  it("objet et corps avec les deux dates", () => {
    const m = mailOdjAuConseil(odj("05/10/2026 à 18h30", "16/11/2026"));
    expect(m.sujet).toBe("Ordre du jour du conseil syndical du 05/10/2026 à 18h30 - Les Marronniers");
    expect(m.corps).toContain(
      "Vous trouverez ci-joint l'ordre du jour de la réunion du conseil syndical du 05/10/2026 à 18h30, préparatoire à l'assemblée générale du 16/11/2026.",
    );
    expect(m.corps.startsWith("Mesdames, Messieurs les membres du conseil syndical,")).toBe(true);
    expect(m.corps.endsWith("Bien cordialement,")).toBe(true);
  });

  it("sans date, la phrase reste correcte (aucun blanc, aucun undefined)", () => {
    const m = mailOdjAuConseil(odj());
    expect(m.sujet).toBe("Ordre du jour du conseil syndical - Les Marronniers");
    expect(m.corps).toContain("de la prochaine réunion du conseil syndical, préparatoire à la prochaine assemblée générale.");
    expect(m.corps).not.toMatch(/undefined/);
  });
});
