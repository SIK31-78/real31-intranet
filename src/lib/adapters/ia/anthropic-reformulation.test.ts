// Adapter Anthropic, sans réseau : les paramètres envoyés (aucun outil, réflexion coupée sur
// Sonnet 5.5, repli serveur) et le classement des erreurs du SDK.

import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { erreurDepuis, parametresAppel } from "./anthropic-reformulation";

const DEMANDE = { systeme: "consignes", message: "<brouillon>\nx\n</brouillon>", modele: "claude-sonnet-5-5", maxTokens: 300, delaiMs: 20_000 };

describe("parametresAppel", () => {
  it("Sonnet 5.5 : consignes en system, brouillon en user, sans outil, réflexion coupée, effort bas, repli", () => {
    expect(parametresAppel(DEMANDE)).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 300,
      system: "consignes",
      messages: [{ role: "user", content: "<brouillon>\nx\n</brouillon>" }],
      output_config: { effort: "low" },
      thinking: { type: "between_tools" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  });

  it("aucune température (refusée par ces modèles) ni outil", () => {
    const p = parametresAppel(DEMANDE);
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("tools");
  });

  it("un autre modèle : pas de between_tools (propre à Sonnet 5.5)", () => {
    const p = parametresAppel({ ...DEMANDE, modele: "claude-opus-5-5" });
    expect(p).not.toHaveProperty("thinking");
    expect(p.fallbacks).toBe("default");
    const h = parametresAppel({ ...DEMANDE, modele: "claude-haiku-5-5" });
    expect(h).not.toHaveProperty("fallbacks");
    expect(h).not.toHaveProperty("betas");
  });
});

describe("erreurDepuis", () => {
  const h = new Headers();
  it("range les erreurs du SDK par code, sans le texte envoyé", () => {
    expect(erreurDepuis(new Anthropic.APIConnectionTimeoutError()).code).toBe("delai");
    expect(erreurDepuis(new Anthropic.RateLimitError(429, undefined, "rate", h)).code).toBe("saturation");
    expect(erreurDepuis(new Anthropic.AuthenticationError(401, undefined, "bad key", h)).code).toBe("configuration");
    expect(erreurDepuis(new Anthropic.BadRequestError(400, undefined, "Your credit balance is too low", h)).code).toBe("credit");
    expect(erreurDepuis(new Anthropic.InternalServerError(529, undefined, "overloaded", h)).code).toBe("saturation");
    expect(erreurDepuis(new Anthropic.BadRequestError(400, undefined, "invalid", h)).code).toBe("api");
    expect(erreurDepuis(new Error("boom")).code).toBe("api");
  });
});
