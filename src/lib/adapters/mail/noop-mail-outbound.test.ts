import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NoopMailOutboundProvider } from "./noop-mail-outbound";

describe("NoopMailOutboundProvider.creerBrouillonNeuf", () => {
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("ne cree rien et ne renvoie pas de webLink (mode mail inactif)", async () => {
    const provider = new NoopMailOutboundProvider();
    const res = await provider.creerBrouillonNeuf({
      boite: "gestionnaire@real31.fr",
      sujet: "Declaration sinistre",
      corps: "Bonjour,\nVeuillez trouver...",
    });
    expect(res).toEqual({});
    expect(res.webLink).toBeUndefined();
  });
});
