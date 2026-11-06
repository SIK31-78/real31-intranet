import { describe, expect, it } from "vitest";
import { NOTE_LONGUEUR_MAX } from "./boite-equipe";
import { cheminDossierHorsBinome, DOSSIERS_HORS_BINOME } from "./tri-emails";
import {
  adressesHorsReal31,
  corpsDuTransfertTri,
  destinatairesDeNote,
  destinatairesDuTransfert,
  noteDeTransfert,
  refusDestinatairesTri,
} from "./transfert-tri";

describe("corpsDuTransfertTri", () => {
  it("met la mention en tête, puis le mot, séparé d'une ligne vide", () => {
    expect(corpsDuTransfertTri("Syndic2@real31.fr", "Camille TEST", "  Pour toi, vente.  ")).toBe(
      "Mail transféré depuis la boîte syndic2@real31.fr par Camille TEST.\n\nPour toi, vente.",
    );
  });
  it("sans mot : la mention seule ; sans nom : sans « par »", () => {
    expect(corpsDuTransfertTri("syndic2@real31.fr", "Camille TEST", "   ")).toBe("Mail transféré depuis la boîte syndic2@real31.fr par Camille TEST.");
    expect(corpsDuTransfertTri("syndic2@real31.fr", " ", "")).toBe("Mail transféré depuis la boîte syndic2@real31.fr.");
  });
});

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

describe("destinatairesDeNote (l'inverse de noteDeTransfert)", () => {
  it("relit À et Cc de la note écrite au transfert", () => {
    const a = ["vente@real31.fr", "location@real31.fr"];
    const cc = ["accueil@real31.fr"];
    expect(destinatairesDeNote(noteDeTransfert(a, cc, "Camille TEST"))).toEqual({ a, cc });
    expect(destinatairesDeNote(noteDeTransfert(["vente@real31.fr"], [], "Camille TEST"))).toEqual({ a: ["vente@real31.fr"], cc: [] });
    // Sans auteur connu : « Transféré à x. »
    expect(destinatairesDeNote(noteDeTransfert(["vente@real31.fr"], [], ""))).toEqual({ a: ["vente@real31.fr"], cc: [] });
  });

  it("un nom d'auteur avec « par » ou des parenthèses ne trouble rien", () => {
    expect(destinatairesDeNote("Transféré à vente@real31.fr par Jean (par intérim) PAR.")).toEqual({ a: ["vente@real31.fr"], cc: [] });
  });

  it("une note coupée perd l'adresse incomplète, jamais une adresse inventée", () => {
    const longues = Array.from({ length: 50 }, (_, i) => `${"x".repeat(60)}${i}@real31.fr`);
    const relu = destinatairesDeNote(noteDeTransfert(longues.slice(0, 40), longues.slice(40), "Camille TEST"));
    expect(relu).not.toBeNull();
    expect(relu!.a.length).toBeGreaterThan(0);
    expect(relu!.a.length).toBeLessThan(40);
    expect([...relu!.a, ...relu!.cc].every((e) => longues.includes(e))).toBe(true);
    // Coupée dans le Cc, sans parenthèse fermante.
    expect(destinatairesDeNote("Transféré à vente@real31.fr (Cc : accueil@real31.fr, loc@rea… par Camille TEST.")).toEqual({
      a: ["vente@real31.fr"],
      cc: ["accueil@real31.fr"],
    });
  });

  it("une note ordinaire de l'équipe n'est pas une trace de transfert", () => {
    expect(destinatairesDeNote("Le client rappelle demain.")).toBeNull();
    expect(destinatairesDeNote("Transféré à Paul par téléphone.")).toBeNull();
  });
});

describe("destinatairesDuTransfert (une ligne « Transférés » du journal)", () => {
  const note = (texte: string, creeLe: string) => ({ texte, creeLe });
  const n1 = note("Transféré à vente@real31.fr par Camille TEST.", "2026-11-06T09:00:05Z");
  const n2 = note("Transféré à location@real31.fr (Cc : vente@real31.fr) par Camille TEST.", "2026-11-06T10:00:04Z");

  it("prend la trace écrite juste après le rangement de la ligne", () => {
    const notes = [n2, note("Le client rappelle demain.", "2026-11-06T09:30:00Z"), n1];
    expect(destinatairesDuTransfert(notes, "2026-11-06T09:00:00Z")).toEqual(["vente@real31.fr"]);
    expect(destinatairesDuTransfert(notes, "2026-11-06T10:00:00Z")).toEqual(["location@real31.fr", "vente@real31.fr"]);
  });

  it("à défaut, la dernière trace ; sans trace, null", () => {
    expect(destinatairesDuTransfert([n1, n2], "2026-11-06T11:00:00Z")).toEqual(["location@real31.fr", "vente@real31.fr"]);
    expect(destinatairesDuTransfert([note("Le client rappelle demain.", "2026-11-06T09:30:00Z")], "2026-11-06T09:00:00Z")).toBeNull();
    expect(destinatairesDuTransfert([], "2026-11-06T09:00:00Z")).toBeNull();
  });
});
