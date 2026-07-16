// Tests de l'adapter Signitic (audit API 2026-07-16) : cache TTL par email (la signature
// etait refetchee a chaque envoi), degrade null, timeout pose. fetch stubbe.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SigniticSignatureProvider } from "./signitic-signature-provider";

beforeEach(() => {
  process.env.SIGNITIC_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.SIGNITIC_API_KEY;
  vi.unstubAllGlobals();
});

describe("SigniticSignatureProvider", () => {
  it("met la signature en cache : deux lectures = UN seul appel HTTP", async () => {
    const spy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal); // timeout pose
      return new Response("<div>signature</div>", { status: 200 });
    });
    vi.stubGlobal("fetch", spy);
    const provider = new SigniticSignatureProvider();
    const h1 = await provider.getSignatureHtml("cache-hit@real31.fr");
    const h2 = await provider.getSignatureHtml("cache-hit@real31.fr");
    expect(h1).toBe("<div>signature</div>");
    expect(h2).toBe(h1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ne met PAS en cache un echec (404) : l'envoi suivant retente", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("<div>sig</div>", { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const provider = new SigniticSignatureProvider();
    expect(await provider.getSignatureHtml("cache-miss@real31.fr")).toBeNull();
    expect(await provider.getSignatureHtml("cache-miss@real31.fr")).toBe("<div>sig</div>");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("degrade null sans throw quand le reseau casse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));
    const provider = new SigniticSignatureProvider();
    expect(await provider.getSignatureHtml("erreur-reseau@real31.fr")).toBeNull();
  });
});
