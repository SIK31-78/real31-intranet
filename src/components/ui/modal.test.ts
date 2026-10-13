// Bornage de la fenetre deplacable (REA-138) : elle ne sort jamais de l'ecran.

import { describe, expect, it } from "vitest";
import { borner } from "./modal";

describe("borner", () => {
  // Ecran de 1000 px, fenetre de 400 px posee a 300 px du bord.
  it("laisse passer un deplacement qui reste dans l'ecran", () => {
    expect(borner(300, 400, 120, 1000)).toBe(120);
    expect(borner(300, 400, -200, 1000)).toBe(-200);
  });
  it("arrete la fenetre au bord gauche/haut", () => {
    expect(borner(300, 400, -900, 1000)).toBe(-300);
  });
  it("arrete la fenetre au bord droit/bas", () => {
    expect(borner(300, 400, 900, 1000)).toBe(300);
  });
  it("une fenetre plus grande que l'ecran continue de le couvrir", () => {
    // 1200 px dans 1000 : le bord gauche reste entre -200 et 0.
    expect(borner(0, 1200, 50, 1000)).toBe(0);
    expect(borner(0, 1200, -500, 1000)).toBe(-200);
  });
});
