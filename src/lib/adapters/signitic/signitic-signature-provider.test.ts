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

describe("SigniticSignatureProvider.getProfil", () => {
  const corps = (data: Record<string, unknown> | null, success = true) =>
    new Response(JSON.stringify({ success, code: success ? 200 : 404, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  it("lit prénom, nom, ligne directe (phone) et fonction ; un seul appel grâce au cache", async () => {
    const spy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.signitic.app/users/profil-ok%40real31.fr");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
      return corps({ firstname: "Sekou", lastname: "Koma", phone: " 01 47 84 00 71 ", mobile: "06", title: "Gestionnaire" });
    });
    vi.stubGlobal("fetch", spy);
    const provider = new SigniticSignatureProvider();
    const p1 = await provider.getProfil("profil-ok@real31.fr");
    const p2 = await provider.getProfil("profil-ok@real31.fr");
    expect(p1).toEqual({ prenom: "Sekou", nom: "Koma", ligneDirecte: "01 47 84 00 71", fonction: "Gestionnaire" });
    expect(p2).toEqual(p1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("omet la ligne directe vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => corps({ firstname: "Anne", lastname: "Durand", phone: "" })));
    const p = await new SigniticSignatureProvider().getProfil("sans-ligne@real31.fr");
    expect(p).toEqual({ prenom: "Anne", nom: "Durand" });
  });

  it("null sur 404, sans mise en cache (le suivant retente)", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(corps({ firstname: "Paul", lastname: "Roy" }));
    vi.stubGlobal("fetch", spy);
    const provider = new SigniticSignatureProvider();
    expect(await provider.getProfil("profil-404@real31.fr")).toBeNull();
    expect(await provider.getProfil("profil-404@real31.fr")).toMatchObject({ prenom: "Paul" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("null sur success=false, réseau cassé ou clé absente (sans appel)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => corps(null, false)));
    expect(await new SigniticSignatureProvider().getProfil("profil-ko@real31.fr")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));
    expect(await new SigniticSignatureProvider().getProfil("profil-reseau@real31.fr")).toBeNull();

    delete process.env.SIGNITIC_API_KEY;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await new SigniticSignatureProvider().getProfil("profil-sans-cle@real31.fr")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("la trace d'échec ne contient jamais l'email", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await new SigniticSignatureProvider().getProfil("secret-pii@real31.fr");
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("secret-pii");
    warn.mockRestore();
  });
});
