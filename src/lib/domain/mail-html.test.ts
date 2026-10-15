import { describe, expect, it } from "vitest";
import { htmlAffichable } from "./mail-html";

const PHOTO = { contentId: "<image001.png@01DB>", type: "image/png", base64: "AAAA" };

describe("HTML d'un mail pour l'affichage", () => {
  it("remplace une image collée (cid:) par son contenu", () => {
    const h = htmlAffichable('<html><head></head><body><img src="cid:image001.png@01DB"></body></html>', [PHOTO]);
    expect(h).toContain('src="data:image/png;base64,AAAA"');
    expect(h).toContain('<head><base target="_blank">');
  });

  it("garde le cid: inconnu et les images hébergées à l'extérieur", () => {
    const h = htmlAffichable('<img src="cid:inconnu"><img src="https://exemple.fr/logo.png">', [PHOTO]);
    expect(h).toContain("cid:inconnu");
    expect(h).toContain("https://exemple.fr/logo.png");
    expect(h.startsWith('<base target="_blank">')).toBe(true);
  });

  it("n'embarque pas au-delà du plafond, ni ce qui n'est pas une image", () => {
    const gros = { contentId: "a", type: "image/png", base64: "x".repeat(20) };
    const pdf = { contentId: "b", type: "application/pdf", base64: "yy" };
    const h = htmlAffichable('<img src="cid:a"><img src="cid:b">', [gros, pdf], 10);
    expect(h).toContain("cid:a");
    expect(h).toContain("cid:b");
  });
});
