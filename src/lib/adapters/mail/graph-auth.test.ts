// Tests de graphFetch (audit API 2026-07-16) : timeout systematique + retry GET-only
// sur 429/5xx. On stubbe fetch : aucun appel reseau reel.

import { describe, it, expect, vi, afterEach } from "vitest";
import { graphFetch } from "./graph-auth";

function reponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response("{}", { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("graphFetch", () => {
  it("passe un signal d'abort (timeout) a chaque appel", async () => {
    const spy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return reponse(200);
    });
    vi.stubGlobal("fetch", spy);
    const r = await graphFetch("https://graph.microsoft.com/v1.0/test");
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rejoue UNE fois un GET sur 429 (en honorant retry-after)", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reponse(429, { "retry-after": "0.001" }))
      .mockResolvedValueOnce(reponse(200));
    vi.stubGlobal("fetch", spy);
    const r = await graphFetch("https://graph.microsoft.com/v1.0/test");
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("rejoue UNE fois un GET sur 503, puis rend la reponse telle quelle", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reponse(503, { "retry-after": "0.001" }))
      .mockResolvedValueOnce(reponse(503, { "retry-after": "0.001" }));
    vi.stubGlobal("fetch", spy);
    const r = await graphFetch("https://graph.microsoft.com/v1.0/test");
    // Pas de 3e tentative : un seul retry.
    expect(r.status).toBe(503);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ne rejoue JAMAIS une ecriture (POST) : risque de doublon", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reponse(503));
    vi.stubGlobal("fetch", spy);
    const r = await graphFetch("https://graph.microsoft.com/v1.0/sendMail", { method: "POST" });
    expect(r.status).toBe(503);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
