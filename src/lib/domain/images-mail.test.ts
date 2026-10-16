import { describe, expect, it } from "vitest";
import { imagesDuCorps, NB_MAX_IMAGES } from "./images-mail";

const pj = (nom: string, type: string, taille: number) => ({ id: nom, nom, type, taille });

describe("photos collées dans le corps d'un mail", () => {
  it("garde les photos, écarte les logos de signature et ce qui n'est pas une image", () => {
    const l = [pj("photo-fuite.jpg", "image/jpeg", 850_000), pj("logo.png", "image/png", 6_000), pj("note.pdf", "application/pdf", 90_000)];
    expect(imagesDuCorps(l).map((x) => x.nom)).toEqual(["photo-fuite.jpg"]);
  });

  it("borne le nombre de vignettes", () => {
    const l = Array.from({ length: 30 }, (_, i) => pj(`p${i}.jpg`, "image/jpeg", 50_000));
    expect(imagesDuCorps(l)).toHaveLength(NB_MAX_IMAGES);
  });
});
