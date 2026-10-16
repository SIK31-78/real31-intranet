import { describe, expect, it, vi } from "vitest";
import { CachePartageSignature, type CacheurSignature } from "./cache-partage-signature";

// Cacheur de test : garde le premier résultat réussi par email, comme le cache de données de Next.
const memo: CacheurSignature = (charger) => {
  const vus = new Map<string, Promise<string>>();
  return (email) => {
    const p = vus.get(email) ?? charger(email);
    vus.set(email, p);
    p.catch(() => vus.delete(email));
    return p;
  };
};

describe("CachePartageSignature", () => {
  it("n'appelle Signitic qu'une fois par personne", async () => {
    const getSignatureHtml = vi.fn(async () => "<p>Nicolas</p>");
    const c = new CachePartageSignature({ getSignatureHtml, getProfil: async () => null }, memo);
    expect(await c.getSignatureHtml("Nicolas.Peloquin@real31.fr")).toBe("<p>Nicolas</p>");
    await c.getSignatureHtml("nicolas.peloquin@real31.fr");
    expect(getSignatureHtml).toHaveBeenCalledTimes(1);
  });

  it("une absence de signature n'est pas gardée : on réessaie", async () => {
    const getSignatureHtml = vi.fn(async () => null);
    const c = new CachePartageSignature({ getSignatureHtml, getProfil: async () => null }, memo);
    expect(await c.getSignatureHtml("a@real31.fr")).toBeNull();
    expect(await c.getSignatureHtml("a@real31.fr")).toBeNull();
    expect(getSignatureHtml).toHaveBeenCalledTimes(2);
  });
});
