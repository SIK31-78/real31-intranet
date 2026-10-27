// Tests de graphFetch (audit API 2026-07-16) : timeout systematique + retry GET-only
// sur 429/5xx. On stubbe fetch : aucun appel reseau reel.

import { describe, it, expect, vi, afterEach } from "vitest";
import { graphFetch, resoudreMessageId } from "./graph-auth";

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

describe("identifiants immuables (REA-420)", () => {
  const prefer = (init?: RequestInit) => new Headers(init?.headers).get("prefer");

  it("pose IdType=ImmutableId sur un appel mail, a la suite des preferences existantes", async () => {
    const spy = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => reponse(200));
    vi.stubGlobal("fetch", spy);
    await graphFetch("https://graph.microsoft.com/v1.0/users/b%40x.fr/messages/AAA/move", { method: "POST", headers: { Authorization: "Bearer t" } });
    await graphFetch("https://graph.microsoft.com/v1.0/users/b%40x.fr/mailFolders/inbox/messages/delta?$select=id", {
      headers: { Authorization: "Bearer t", Prefer: 'outlook.body-content-type="text", odata.maxpagesize=50' },
    });
    expect(prefer(spy.mock.calls[0]![1])).toBe('IdType="ImmutableId"');
    expect(prefer(spy.mock.calls[1]![1])).toBe('outlook.body-content-type="text", odata.maxpagesize=50, IdType="ImmutableId"');
    // L'autorisation passe toujours.
    expect(new Headers(spy.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer t");
  });

  it("ne touche ni au calendrier, ni a SharePoint, ni a une session d'upload, ni a un IdType deja pose", async () => {
    const spy = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => reponse(200));
    vi.stubGlobal("fetch", spy);
    await graphFetch("https://graph.microsoft.com/v1.0/users/b%40x.fr/events", { headers: { Prefer: 'outlook.timezone="Europe/Paris"' } });
    await graphFetch("https://graph.microsoft.com/v1.0/drives/d/root:/messages:/children");
    await graphFetch("https://graph.microsoft.com/v1.0/users/b%40x.fr/messages", { headers: { Prefer: 'IdType="RestId"' } });
    await graphFetch("https://outlook.office.com/api/v2.0/Users('x')/Messages('y')/AttachmentSessions('z')", { method: "PUT" });
    expect(prefer(spy.mock.calls[0]![1])).toBe('outlook.timezone="Europe/Paris"');
    expect(prefer(spy.mock.calls[1]![1])).toBeNull();
    expect(prefer(spy.mock.calls[2]![1])).toBe('IdType="RestId"');
    // Session d'upload deja signee, hors Graph : rien en plus.
    expect(prefer(spy.mock.calls[3]![1])).toBeNull();
  });

  it("resoudreMessageId garde l'id en cache : pas de second $filter pour le meme mail", async () => {
    const spy = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ value: [{ id: "immuable-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    expect(await resoudreMessageId("t", "Cache@x.fr", "<cache-1@x>")).toBe("immuable-1");
    expect(await resoudreMessageId("t", "cache@x.fr", "<cache-1@x>")).toBe("immuable-1");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toContain("filter=");
    expect(prefer(spy.mock.calls[0]![1])).toBe('IdType="ImmutableId"');
    // Un autre mail, ou une autre boite : nouvelle resolution.
    await resoudreMessageId("t", "autre@x.fr", "<cache-1@x>");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("resoudreMessageId ne met pas en cache un mail introuvable", async () => {
    const spy = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ value: [] }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await expect(resoudreMessageId("t", "b@x.fr", "<absent@x>")).rejects.toThrow(/introuvable/i);
    await expect(resoudreMessageId("t", "b@x.fr", "<absent@x>")).rejects.toThrow(/introuvable/i);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
