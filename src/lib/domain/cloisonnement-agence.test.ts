// Tests de la logique PURE du cloisonnement par agence (confort d'affichage). Aucun
// reseau, aucun mock. Couvre memeAgence + partitionnerParAgence, et applique la partition
// aux vraies salles (retag JF -> LGC, ASN sans salle) pour verrouiller la decision Sekou.

import { describe, expect, it } from "vitest";
import { memeAgence, partitionnerParAgence } from "./cloisonnement-agence";
import { sallesReunion } from "./salles-reunion";

describe("memeAgence", () => {
  it("deux etiquettes egales et non vides -> meme agence", () => {
    expect(memeAgence("LGC", "LGC")).toBe(true);
    expect(memeAgence("agence-1", "agence-1")).toBe(true);
  });

  it("etiquettes differentes -> agences differentes", () => {
    expect(memeAgence("LGC", "ML")).toBe(false);
  });

  it("une etiquette absente n'appartient a aucune agence", () => {
    expect(memeAgence(undefined, "LGC")).toBe(false);
    expect(memeAgence("LGC", null)).toBe(false);
    expect(memeAgence("", "")).toBe(false);
    expect(memeAgence(undefined, undefined)).toBe(false);
  });
});

describe("partitionnerParAgence", () => {
  const items = [
    { id: "a", ag: "LGC" },
    { id: "b", ag: "ML" },
    { id: "c", ag: "LGC" },
    { id: "d", ag: undefined },
  ];

  it("separe l'agence de reference du reste", () => {
    const { memeAgence: meme, autres } = partitionnerParAgence(items, (i) => i.ag, "LGC");
    expect(meme.map((i) => i.id)).toEqual(["a", "c"]);
    expect(autres.map((i) => i.id)).toEqual(["b", "d"]);
  });

  it("un item sans etiquette tombe toujours dans 'autres' (jamais par defaut)", () => {
    const { memeAgence: meme, autres } = partitionnerParAgence(items, (i) => i.ag, "ML");
    expect(meme.map((i) => i.id)).toEqual(["b"]);
    expect(autres.map((i) => i.id)).toContain("d");
  });

  it("sans reference d'agence : aucun filtre, tout passe par defaut", () => {
    const { memeAgence: meme, autres } = partitionnerParAgence(items, (i) => i.ag, undefined);
    expect(meme).toHaveLength(items.length);
    expect(autres).toHaveLength(0);
  });
});

describe("partition des salles reelles (decision Sekou)", () => {
  const agenceDe = (s: { agence?: string }) => s.agence;

  it("filtree par 'LGC' : inclut la salle JF (annexe de LGC)", () => {
    const { memeAgence: meme } = partitionnerParAgence(sallesReunion(), agenceDe, "LGC");
    expect(meme.some((s) => s.email === "real31JF@real31.fr")).toBe(true);
    // 3 salles LGC + la JF = 4 salles.
    expect(meme).toHaveLength(4);
  });

  it("filtree par 'ASN' : aucune salle (debordement uniquement)", () => {
    const { memeAgence: meme, autres } = partitionnerParAgence(sallesReunion(), agenceDe, "ASN");
    expect(meme).toHaveLength(0);
    expect(autres).toHaveLength(sallesReunion().length);
  });

  it("filtree par 'ML' : la seule salle ML", () => {
    const { memeAgence: meme } = partitionnerParAgence(sallesReunion(), agenceDe, "ML");
    expect(meme.map((s) => s.email)).toEqual(["REAL31ML@real31.fr"]);
  });
});
