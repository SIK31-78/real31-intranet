import { describe, expect, it } from "vitest";
import { numeroterResolutions, rangParent } from "./resolution";

// La numerotation part dans la convocation legale : elle etait ecrite deux fois dans
// l'ecran de composition, jamais testee (audit 16/09/2026).

describe("numeroterResolutions", () => {
  const items = [
    { id: "a", enfant: false },
    { id: "g", enfant: false },
    { id: "g1", enfant: true },
    { id: "g2", enfant: true },
    { id: "b", enfant: false },
  ];
  it("numerote les resolutions de tete, les enfants portent le numero de leur groupe", () => {
    const l = numeroterResolutions(items, (i) => i.enfant);
    expect(l.map((x) => `${x.item.id}:${x.numero}${x.enfant ? "e" : ""}`)).toEqual(["a:1", "g:2", "g1:2e", "g2:2e", "b:3"]);
  });
  it("marque la premiere et la derniere de tete, jamais un enfant", () => {
    const l = numeroterResolutions(items, (i) => i.enfant);
    expect(l.filter((x) => x.premierTop).map((x) => x.item.id)).toEqual(["a"]);
    expect(l.filter((x) => x.dernierTop).map((x) => x.item.id)).toEqual(["b"]);
    const seule = numeroterResolutions([items[0]!], (i) => i.enfant)[0]!;
    expect(seule.premierTop && seule.dernierTop).toBe(true);
    expect(numeroterResolutions([], () => false)).toEqual([]);
  });
  it("s'applique au brouillon via le rang (1, 1.1, 1.2, 2)", () => {
    const draft = ["1", "1.1", "1.2", "2"].map((rank) => ({ rank }));
    const l = numeroterResolutions(draft, (r) => rangParent(r.rank) !== null);
    expect(l.map((x) => `${x.item.rank}:${x.numero}${x.enfant ? "e" : ""}`)).toEqual(["1:1", "1.1:1e", "1.2:1e", "2:2"]);
  });
});
