import { describe, expect, it, vi } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import { CachePartageCoprosEstale, type Cacheur } from "./cache-partage-copros-estale";

const copro = (code: string) => ({ code, nom: `Copro ${code}` }) as Copropriete;

// Cacheur de test : garde le premier resultat, comme le cache de donnees de Next.
const memo: Cacheur = (charger) => {
  let p: Promise<Copropriete[]> | null = null;
  return () => (p ??= charger());
};

describe("CachePartageCoprosEstale", () => {
  it("n'appelle ESTALE qu'une fois pour la liste et la recherche par code", async () => {
    const lister = vi.fn(async () => [copro("S300"), copro("S0247")]);
    const p = new CachePartageCoprosEstale({ listerCoprosEstale: lister, getCoproEstale: vi.fn() }, memo);
    expect((await p.listerCoprosEstale()).length).toBe(2);
    expect((await p.getCoproEstale("S247"))?.code).toBe("S0247");
    expect(await p.getCoproEstale("S999")).toBeNull();
    expect(lister).toHaveBeenCalledTimes(1);
  });
});
