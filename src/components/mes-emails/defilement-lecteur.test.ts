import { describe, expect, it } from "vitest";
import { lecteurSousLaListe } from "./defilement-lecteur";

describe("lecteurSousLaListe", () => {
  it("est vrai sur téléphone et tablette portrait", () => {
    expect(lecteurSousLaListe(390)).toBe(true);
    expect(lecteurSousLaListe(1023)).toBe(true);
  });
  it("est faux dès que la liste et le lecteur sont côte à côte", () => {
    expect(lecteurSousLaListe(1024)).toBe(false);
    expect(lecteurSousLaListe(1440)).toBe(false);
  });
});
