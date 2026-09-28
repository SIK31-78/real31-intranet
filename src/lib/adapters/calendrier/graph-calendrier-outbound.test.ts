// Adapter Graph sortant : on verifie le corps envoye a Graph (aucun appel reseau,
// graphFetch et le jeton sont mockes).

import { beforeEach, describe, expect, it, vi } from "vitest";

const appels = vi.hoisted(() => [] as { url: string; init: { method?: string; body?: string } }[]);

vi.mock("../mail/graph-auth", () => ({
  GRAPH: "https://graph.test",
  jetonGraph: async () => "jeton",
  graphFetch: async (url: string, init: { method?: string; body?: string }) => {
    appels.push({ url, init });
    return new Response(JSON.stringify({ id: "evt-1" }), { status: 200 });
  },
}));

import { GraphCalendrierOutboundProvider } from "./graph-calendrier-outbound";

function corps(i: number): Record<string, unknown> {
  return JSON.parse(appels[i]?.init.body ?? "{}") as Record<string, unknown>;
}

beforeEach(() => {
  appels.length = 0;
});

describe("GraphCalendrierOutboundProvider : aucune reponse demandee aux invites", () => {
  it("creerEvenement pose responseRequested: false", async () => {
    await new GraphCalendrierOutboundProvider().creerEvenement({
      boite: "remi@real31.fr",
      sujet: "S024 : AG à confirmer",
      debut: "2026-10-01T18:00:00",
      participants: ["emmanuel@real31.fr"],
    });
    expect(appels[0]?.init.method).toBe("POST");
    expect(corps(0).responseRequested).toBe(false);
  });

  it("mettreAJourEvenement pose aussi responseRequested: false (rattrapage des anciens)", async () => {
    await new GraphCalendrierOutboundProvider().mettreAJourEvenement("remi@real31.fr", "evt-1", {
      titre: "S024 : AG confirmée",
    });
    expect(appels[0]?.init.method).toBe("PATCH");
    expect(corps(0)).toMatchObject({ subject: "S024 : AG confirmée", responseRequested: false });
  });

  it("un PATCH sans changement n'appelle pas Graph", async () => {
    await new GraphCalendrierOutboundProvider().mettreAJourEvenement("remi@real31.fr", "evt-1", {});
    expect(appels).toHaveLength(0);
  });
});
