import { describe, expect, it } from "vitest";
import { NOTE_LONGUEUR_MAX } from "./boite-equipe";
import { cheminDossierHorsBinome, DOSSIERS_HORS_BINOME } from "./tri-emails";
import { adressesHorsReal31, noteDeTransfert, refusDestinatairesTri } from "./transfert-tri";

// Transfert d'un mail du tri à un collègue (REA-500, 06/11/2026) : collègues REAL31 seulement,
// 50 destinataires au plus, et la note « transféré à … par … » laissée sur le mail.

describe("refusDestinatairesTri", () => {
  it("accepte des collègues REAL31 en À et en Cc, casse et espaces ignorés", () => {
    expect(refusDestinatairesTri(["vente@real31.fr", " Location@REAL31.fr "], ["accueil@real31.fr"])).toBeNull();
  });

  it("refuse une adresse hors REAL31, en À comme en Cc, et la nomme", () => {
    expect(refusDestinatairesTri(["client@exemple.fr"], [])).toBe(
      "Depuis le tri, un mail ne se transfère qu'aux collègues REAL31 (adresses @real31.fr) : « client@exemple.fr » est refusée.",
    );
    expect(refusDestinatairesTri(["vente@real31.fr"], ["a@exemple.fr", "b@real31.fr.exemple.fr"])).toContain(
      "« a@exemple.fr », « b@real31.fr.exemple.fr » sont refusées",
    );
  });

  it("un sous-domaine ou un faux suffixe n'est pas REAL31", () => {
    expect(adressesHorsReal31(["x@mail.real31.fr", "y@notreal31.fr", "z@real31.fr"], [])).toEqual(["x@mail.real31.fr", "y@notreal31.fr"]);
  });

  it("exige un destinataire en « À », 50 au plus en tout", () => {
    expect(refusDestinatairesTri([], ["vente@real31.fr"])).toBe("Ajoute au moins un collègue en « À ».");
    const cinquante = Array.from({ length: 50 }, (_, i) => `c${i}@real31.fr`);
    expect(refusDestinatairesTri(cinquante.slice(0, 40), cinquante.slice(40))).toBeNull();
    expect(refusDestinatairesTri(cinquante, ["en-trop@real31.fr"])).toBe("Trop de destinataires (50 maximum).");
  });
});

describe("noteDeTransfert", () => {
  it("dit à qui et par qui", () => {
    expect(noteDeTransfert(["Vente@real31.fr"], [], "Camille TEST")).toBe("Transféré à vente@real31.fr par Camille TEST.");
    expect(noteDeTransfert(["vente@real31.fr", "location@real31.fr"], ["accueil@real31.fr"], "Camille TEST")).toBe(
      "Transféré à vente@real31.fr, location@real31.fr (Cc : accueil@real31.fr) par Camille TEST.",
    );
  });

  it("tient dans une note, l'auteur gardé", () => {
    const longues = Array.from({ length: 50 }, (_, i) => `${"x".repeat(60)}${i}@real31.fr`);
    const note = noteDeTransfert(longues, [], "Camille TEST");
    expect(note.length).toBeLessThanOrEqual(NOTE_LONGUEUR_MAX);
    expect(note.endsWith("… par Camille TEST.")).toBe(true);
  });
});

describe("dossier « Transférés »", () => {
  it("est un dossier hors binôme sous la boîte de réception", () => {
    expect(DOSSIERS_HORS_BINOME.transferes).toBe("Transférés");
    expect(cheminDossierHorsBinome("transferes")).toBe("Boîte de réception › Transférés");
  });
});
