import { describe, expect, it } from "vitest";
import { dossierCoproDepuisLienAg } from "./mes-emails-depot";

describe("racine SharePoint d'une copropriété", () => {
  it("remonte du dossier d'AG à la racine de la copro", () => {
    expect(dossierCoproDepuisLienAg("https://real31france.sharepoint.com/sites/copro/HLS/S247 - Cyrano/AG")).toBe(
      "https://real31france.sharepoint.com/sites/copro/HLS/S247 - Cyrano",
    );
    expect(dossierCoproDepuisLienAg("https://x.sharepoint.com/sites/copro/HLS/S260/ag/")).toBe("https://x.sharepoint.com/sites/copro/HLS/S260");
    // Lien qui n'est pas un dossier d'AG : gardé tel quel.
    expect(dossierCoproDepuisLienAg("https://x.sharepoint.com/sites/copro/HLS/S260")).toBe("https://x.sharepoint.com/sites/copro/HLS/S260");
  });
});
