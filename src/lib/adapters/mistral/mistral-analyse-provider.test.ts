// Tests de l'adapter Mistral d'analyse (audit API 2026-07-16) : troncature des corps
// envoyes au LLM (cout), timeout/retry de l'appel. fetch stubbe : aucun appel reel.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MistralAnalyseProvider, tronquerCorps } from "./mistral-analyse-provider";

function reponseChat(contenu: string, status = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: contenu } }] }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const CLASSIF = '{"ticketable": true, "type": "panne_intervention", "est_nouveau_ticket": true, "confidence": 0.9, "rationale": "ok"}';

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.MISTRAL_API_KEY;
  vi.unstubAllGlobals();
});

describe("tronquerCorps", () => {
  it("laisse intact un corps sous le plafond", () => {
    expect(tronquerCorps("court", 100)).toBe("court");
  });

  it("tronque au plafond avec un marqueur explicite", () => {
    const long = "x".repeat(5000);
    const t = tronquerCorps(long, 2000);
    expect(t.length).toBeLessThan(2100);
    expect(t).toContain("[... corps tronqué : 5000 caractères au total]");
  });
});

describe("MistralAnalyseProvider.classifier", () => {
  it("tronque le corps envoye au modele (plafond tri = 2000 car.)", async () => {
    let corpsEnvoye = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: { role: string; content: string }[];
        };
        corpsEnvoye = body.messages.find((m) => m.role === "user")?.content ?? "";
        expect(init?.signal).toBeInstanceOf(AbortSignal); // timeout pose
        return reponseChat(CLASSIF);
      }),
    );
    const provider = new MistralAnalyseProvider();
    const cls = await provider.classifier({
      de: "copro@exemple.fr",
      objet: "Ascenseur en panne",
      corps: "blabla ".repeat(2000), // ~14 000 caracteres
    });
    expect(cls.type).toBe("panne_intervention");
    expect(corpsEnvoye).toContain("corps tronqué");
    // Objet + en-tetes + 2000 car. de corps + marqueur : tres loin des 14 000 d'origine.
    expect(corpsEnvoye.length).toBeLessThan(2300);
  });

  it("rejoue sur 429 puis reussit (retry-after honore)", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response("rate limited", { status: 429, headers: { "retry-after": "0.001" } }),
      )
      .mockResolvedValueOnce(reponseChat(CLASSIF));
    vi.stubGlobal("fetch", spy);
    const provider = new MistralAnalyseProvider();
    const cls = await provider.classifier({ de: "a@b.fr", objet: "test", corps: "corps" });
    expect(cls.ticketable).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("rejoue sur erreur reseau (fetch qui throw) au lieu d'echouer net", async () => {
    const spy = vi
      .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(reponseChat(CLASSIF));
    vi.stubGlobal("fetch", spy);
    const provider = new MistralAnalyseProvider();
    const cls = await provider.classifier({ de: "a@b.fr", objet: "test", corps: "corps" });
    expect(cls.type).toBe("panne_intervention");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
