import { describe, expect, it } from "vitest";
import { resoudreDossier, siteDepuisUrl, sousDossiersContrat } from "./depot-contrat";

const LIEN = "https://real31france.sharepoint.com/sites/copro/LGC/Bleuets%202%20bis/AG";
const BIBLIOTHEQUES = [
  { id: "d-docs", webUrl: "https://real31france.sharepoint.com/sites/copro/Shared%20Documents" },
  { id: "d-lgc2", webUrl: "https://real31france.sharepoint.com/sites/copro/LGC2" },
  { id: "d-lgc", webUrl: "https://real31france.sharepoint.com/sites/copro/LGC" },
];

describe("dépôt du contrat dans SharePoint", () => {
  it("range le contrat sous l'année de l'AG, dans « Docs pour convocation »", () => {
    expect(sousDossiersContrat("2026-11-12")).toEqual(["2026", "Docs pour convocation"]);
  });

  it("lit le site depuis le lien du dossier", () => {
    expect(siteDepuisUrl(LIEN)).toEqual({ hote: "real31france.sharepoint.com", cheminSite: "/sites/copro" });
    expect(siteDepuisUrl("pas un lien")).toBeNull();
    expect(siteDepuisUrl("http://real31france.sharepoint.com/sites/copro/LGC")).toBeNull();
  });

  it("retient la bibliothèque qui contient le dossier, sans confondre LGC et LGC2", () => {
    expect(resoudreDossier(LIEN, BIBLIOTHEQUES)).toEqual({ driveId: "d-lgc", chemin: ["Bleuets 2 bis", "AG"] });
    expect(resoudreDossier("https://real31france.sharepoint.com/sites/copro/LGC2/X/AG", BIBLIOTHEQUES)).toEqual({
      driveId: "d-lgc2",
      chemin: ["X", "AG"],
    });
  });

  it("ignore la casse et la barre finale", () => {
    expect(resoudreDossier(`${LIEN}/`, [{ id: "d", webUrl: "https://Real31France.sharepoint.com/sites/copro/lgc" }])).toEqual({
      driveId: "d",
      chemin: ["Bleuets 2 bis", "AG"],
    });
  });

  it("null si aucune bibliothèque ne contient le dossier", () => {
    expect(resoudreDossier(LIEN, [{ id: "d", webUrl: "https://real31france.sharepoint.com/sites/autre/LGC" }])).toBeNull();
  });
});
