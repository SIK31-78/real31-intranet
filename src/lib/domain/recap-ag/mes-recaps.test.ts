import { describe, it, expect } from "vitest";
import { appartenanceRecaps, estMonRecap, filtrerParPortee } from "./mes-recaps";

const moi = appartenanceRecaps(["S104", "S172"], "SK");

describe("estMonRecap", () => {
  it("retient un recap dont la copro est dans le portefeuille", () => {
    expect(estMonRecap({ coproCode: "S104" }, moi)).toBe(true);
  });

  it("retient un recap que J'AI saisi, meme sur une copro qui n'est plus a moi", () => {
    // Reattribution de portefeuille ou depannage d'un collegue : son propre travail
    // ne doit pas disparaitre de sa liste.
    expect(estMonRecap({ coproCode: "S999", par: "SK" }, moi)).toBe(true);
  });

  it("ecarte le recap d'un collegue sur une copro qui n'est pas la mienne", () => {
    expect(estMonRecap({ coproCode: "S999", par: "EL" }, moi)).toBe(false);
  });

  it("ecarte un recap sans auteur sur une copro hors portefeuille", () => {
    expect(estMonRecap({ coproCode: "S999" }, moi)).toBe(false);
  });

  it("compare sans tenir compte de la casse ni des espaces", () => {
    expect(estMonRecap({ coproCode: " s104 " }, moi)).toBe(true);
    expect(estMonRecap({ coproCode: "S999", par: " sk " }, moi)).toBe(true);
  });

  it("des initiales absentes ne font jamais matcher un recap sans auteur", () => {
    const sansInitiales = appartenanceRecaps(["S104"]);
    expect(estMonRecap({ coproCode: "S999" }, sansInitiales)).toBe(false);
    expect(estMonRecap({ coproCode: "S999", par: "" }, sansInitiales)).toBe(false);
  });

  it("un portefeuille vide ne retient que ce que j'ai saisi", () => {
    const nouveau = appartenanceRecaps([], "SK");
    expect(estMonRecap({ coproCode: "S104" }, nouveau)).toBe(false);
    expect(estMonRecap({ coproCode: "S104", par: "SK" }, nouveau)).toBe(true);
  });
});

describe("filtrerParPortee", () => {
  const lot = [
    { id: "a", mien: true },
    { id: "b", mien: false },
    { id: "c", mien: true },
  ];

  it("« moi » ne garde que les miens", () => {
    expect(filtrerParPortee(lot, "moi").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("« tous » garde tout, dans l'ordre recu", () => {
    expect(filtrerParPortee(lot, "tous").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("ne modifie pas le tableau d'origine", () => {
    filtrerParPortee(lot, "tous");
    expect(lot).toHaveLength(3);
  });
});
