// Relecture des etats Linear : on remplace `fetch` pour ne jamais appeler
// api.linear.app, et on verifie ce que l'adapter ENVOIE (paquets, archives).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinearTicketTracker } from "./linear-ticket-tracker";

type Corps = { query: string; variables: { ids: string[]; first: number } };

let appels: Corps[] = [];

beforeEach(() => {
  appels = [];
  vi.stubEnv("LINEAR_API_KEY", "cle-de-test");
  vi.stubEnv("LINEAR_TEAM_ID", "equipe-de-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const corps = JSON.parse(String(init.body)) as Corps;
      appels.push(corps);
      const nodes = corps.variables.ids.map((id) => ({
        id,
        identifier: `REA-${id}`,
        title: `Ticket ${id}`,
        completedAt: null,
        canceledAt: null,
        state: { name: "Todo", type: "unstarted" },
      }));
      return new Response(JSON.stringify({ data: { issues: { nodes } } }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LinearTicketTracker.lireEtats", () => {
  // Sans `includeArchived`, Linear exclut les tickets archivés et le pont les
  // signalait comme « orphelins » alors qu'ils existent toujours.
  it("demande aussi les tickets archivés", async () => {
    await new LinearTicketTracker().lireEtats(["a", "b"]);
    expect(appels).toHaveLength(1);
    expect(appels[0].query).toContain("includeArchived: true");
  });

  // `first` plafonne à 250 : au-delà, un appel unique tronquait la réponse et les
  // tickets en trop sortaient « orphelins ».
  it("découpe au-delà de 250 ids et rend tous les états", async () => {
    const ids = Array.from({ length: 600 }, (_, i) => String(i));
    const etats = await new LinearTicketTracker().lireEtats(ids);

    expect(appels.map((a) => a.variables.ids.length)).toEqual([250, 250, 100]);
    expect(appels.every((a) => a.variables.first === 250)).toBe(true);
    expect(etats).toHaveLength(600);
    expect(new Set(etats.map((e) => e.issueId)).size).toBe(600);
  });

  it("n'appelle pas Linear sans id", async () => {
    expect(await new LinearTicketTracker().lireEtats([])).toEqual([]);
    expect(appels).toHaveLength(0);
  });
});
