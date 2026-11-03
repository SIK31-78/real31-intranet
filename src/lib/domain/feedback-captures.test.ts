import { describe, expect, it } from "vitest";
import { cheminCapture, erreurCaptures, TAILLE_MAX_CAPTURES, typeDeChemin } from "./feedback-captures";

const png = (taille = 200_000) => ({ contentType: "image/png", taille });

describe("captures d'une remontee", () => {
  it("accepte jusqu'a trois images legeres", () => {
    expect(erreurCaptures([])).toBeNull();
    expect(erreurCaptures([png(), png(), { contentType: "image/jpeg", taille: 10 }])).toBeNull();
  });

  it("refuse le nombre, le format, le vide et le poids", () => {
    expect(erreurCaptures([png(), png(), png(), png()])).toMatch(/3 captures/);
    expect(erreurCaptures([{ contentType: "application/pdf", taille: 10 }])).toMatch(/PNG/);
    expect(erreurCaptures([png(0)])).toMatch(/vide/);
    expect(erreurCaptures([png(TAILLE_MAX_CAPTURES), png(1)])).toMatch(/trop lourdes/);
  });

  it("range les captures dans un dossier par remontee", () => {
    expect(cheminCapture("abc", 0, "image/jpeg")).toBe("captures/abc/1.jpg");
    expect(typeDeChemin("captures/abc/2.webp")).toBe("image/webp");
  });
});
