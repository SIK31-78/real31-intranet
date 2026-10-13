import { describe, expect, it } from "vitest";
import { DOSSIER_PIECES_RECUES, dossierCoproDepuisLienAg, nomFichierDepose, sousDossiersPieceRecue } from "./mes-emails-depot";

describe("dépôt d'une pièce jointe sur SharePoint", () => {
  it("remonte du dossier d'AG à la racine de la copro", () => {
    expect(dossierCoproDepuisLienAg("https://real31france.sharepoint.com/sites/copro/HLS/S247 - Cyrano/AG")).toBe(
      "https://real31france.sharepoint.com/sites/copro/HLS/S247 - Cyrano",
    );
    expect(dossierCoproDepuisLienAg("https://x.sharepoint.com/sites/copro/HLS/S260/ag/")).toBe("https://x.sharepoint.com/sites/copro/HLS/S260");
    // Lien qui n'est pas un dossier d'AG : gardé tel quel.
    expect(dossierCoproDepuisLienAg("https://x.sharepoint.com/sites/copro/HLS/S260")).toBe("https://x.sharepoint.com/sites/copro/HLS/S260");
  });

  it("range par convention puis par année de réception", () => {
    expect(sousDossiersPieceRecue("2026-10-13T08:12:00Z")).toEqual([DOSSIER_PIECES_RECUES, "2026"]);
  });

  it("préfixe la date (pas d'écrasement) et nettoie les caractères refusés", () => {
    expect(nomFichierDepose("facture.pdf", "2026-10-13T08:12:00Z")).toBe("2026-10-13 - facture.pdf");
    expect(nomFichierDepose('BI n°12: "urgent"?.pdf', "2026-10-13T08:12:00Z")).toBe("2026-10-13 - BI n°12- -urgent-.pdf");
    expect(nomFichierDepose("   ", "2026-10-13")).toBe("2026-10-13 - piece-jointe");
  });
});
