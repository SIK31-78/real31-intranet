import { describe, expect, it } from "vitest";
import { PAGE_POSTGREST, toutesLesLignes } from "./pages";

describe("toutesLesLignes", () => {
  it("enchaine les pages jusqu'a une page incomplete", async () => {
    const total = PAGE_POSTGREST * 2 + 7;
    const appels: [number, number][] = [];
    const lignes = await toutesLesLignes<number>("Test", async (debut, fin) => {
      appels.push([debut, fin]);
      const data = Array.from({ length: Math.max(0, Math.min(fin, total - 1) - debut + 1) }, (_, i) => debut + i);
      return { data, error: null };
    });
    expect(lignes).toHaveLength(total);
    expect(lignes.at(-1)).toBe(total - 1);
    expect(appels).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("s'arrete a la premiere page vide et remonte l'erreur avec son contexte", async () => {
    expect(await toutesLesLignes("Test", async () => ({ data: [], error: null }))).toEqual([]);
    await expect(toutesLesLignes("Lecture X", async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("Lecture X : boom");
  });
});
