// Test de l'adapter assemblee eStale (audit API 2026-07-16) : la liste des condos
// accessibles est mise en cache module (TTL) au lieu d'etre refetchee a chaque appel.
// estaleGql est mocke : aucun appel reseau reel.

import { describe, it, expect, vi } from "vitest";
import { EstaleAssembleeProvider } from "./estale-assemblee-provider";
import { estaleGql } from "./client";

vi.mock("./client", () => ({
  estaleGql: vi.fn(),
}));

const gql = vi.mocked(estaleGql);

function repondre(query: string): unknown {
  if (query.includes("condos(archived: false)")) {
    return { me: { collaborator: { condos: [{ id: "condo-1", reference: "S0299" }] } } };
  }
  if (query.includes("meetings")) {
    return {
      condo: {
        meetings: [
          {
            id: "meeting-1",
            name: "AGO 2026",
            category: "ORDINARY",
            startAt: "2026-09-01T18:00:00Z",
            isClosed: false,
            motions: [],
          },
        ],
      },
    };
  }
  throw new Error(`query inattendue : ${query.slice(0, 80)}`);
}

describe("EstaleAssembleeProvider (cache condos)", () => {
  it("resout la copro via le cache : 2 getAssemblee = 1 seule query condos", async () => {
    gql.mockImplementation(async (query: string) => repondre(query) as never);
    const provider = new EstaleAssembleeProvider();

    const a1 = await provider.getAssemblee("S299");
    const a2 = await provider.getAssemblee("S0299");
    expect(a1?.meetingId).toBe("meeting-1");
    expect(a2?.meetingId).toBe("meeting-1");

    const queriesCondos = gql.mock.calls.filter(([q]) => q.includes("condos(archived: false)"));
    expect(queriesCondos).toHaveLength(1); // liste chargee UNE fois (TTL 10 min)

    const queriesMeetings = gql.mock.calls.filter(([q]) => q.includes("meetings"));
    expect(queriesMeetings).toHaveLength(2); // l'AG, elle, est bien relue a chaque fois
  });
});
