import { describe, expect, it, vi } from "vitest";
import type { ReferentielTri } from "@/lib/domain/tri-emails";
import { CachePartageReferentielTri, type CacheurReferentiel } from "./cache-partage-referentiel-tri";

// Cacheur de test : garde le premier resultat, comme le cache de donnees de Next.
const memo: CacheurReferentiel = (charger) => {
  let p: Promise<ReferentielTri> | null = null;
  return () => (p ??= charger());
};

describe("CachePartageReferentielTri", () => {
  it("n'interroge ESTALE qu'une fois pour plusieurs affichages du tri", async () => {
    const charger = vi.fn(async (): Promise<ReferentielTri> => ({ copros: [], expediteurs: {} }));
    const p = new CachePartageReferentielTri({ charger }, memo);
    await p.charger();
    await p.charger();
    expect(charger).toHaveBeenCalledTimes(1);
  });
});
