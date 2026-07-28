// Tests du ciblage des annonces (Sekou 2026-07-28) : tout le groupe par defaut,
// union email/agence sinon, jamais d'annonce d'une autre agence.

import { describe, expect, it } from "vitest";
import { annonceVisiblePour, libelleCible } from "./annonce";

describe("annonceVisiblePour", () => {
  it("aucune cible -> visible par tout le monde (meme sans email/agence)", () => {
    expect(annonceVisiblePour({}, "x@real31.fr", "LGC")).toBe(true);
    expect(annonceVisiblePour({ agences: [], emails: [] }, null, undefined)).toBe(true);
  });

  it("cible agence : visible pour l'agence listee, pas pour les autres", () => {
    const a = { agences: ["LGC", "ML"] };
    expect(annonceVisiblePour(a, "x@real31.fr", "LGC")).toBe(true);
    expect(annonceVisiblePour(a, "x@real31.fr", "ml")).toBe(true); // casse ignoree
    expect(annonceVisiblePour(a, "x@real31.fr", "HLS")).toBe(false);
    // Sans agence connue : pas atteint par une cible agence.
    expect(annonceVisiblePour(a, "x@real31.fr", undefined)).toBe(false);
  });

  it("cible collaborateurs : visible pour l'email liste (casse ignoree), pas les autres", () => {
    const a = { emails: ["Sekou.KOMA@real31.fr"] };
    expect(annonceVisiblePour(a, "sekou.koma@real31.fr", "LGC")).toBe(true);
    expect(annonceVisiblePour(a, "remi@real31.fr", "LGC")).toBe(false);
    expect(annonceVisiblePour(a, null, "LGC")).toBe(false);
  });

  it("cibles cumulees (union) : email liste OU agence listee", () => {
    const a = { agences: ["ML"], emails: ["remi@real31.fr"] };
    expect(annonceVisiblePour(a, "remi@real31.fr", "LGC")).toBe(true); // par email
    expect(annonceVisiblePour(a, "x@real31.fr", "ML")).toBe(true); // par agence
    expect(annonceVisiblePour(a, "x@real31.fr", "LGC")).toBe(false); // ni l'un ni l'autre
  });
});

describe("libelleCible", () => {
  it("resume la cible pour le badge admin", () => {
    expect(libelleCible({})).toBe("Tout le groupe");
    expect(libelleCible({ agences: ["LGC", "ML"] })).toBe("LGC, ML");
    expect(libelleCible({ emails: ["a@x.fr"] })).toBe("1 collaborateur");
    expect(libelleCible({ agences: ["HLS"], emails: ["a@x.fr", "b@x.fr"] })).toBe("HLS + 2 collaborateurs");
  });
});
