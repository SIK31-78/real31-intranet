// Corbeille de l'écran E-mails (REA-340) : déplacement vers deleteditems, un mail en
// échec n'arrête pas les autres. Faux fetch, zéro réseau.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./graph-auth", () => ({
  GRAPH: "https://graph",
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
  resoudreMessageId: async (_tk: string, _boite: string, imid: string) => {
    if (imid === "<absent>") throw new Error("Message introuvable");
    return `id-${imid}`;
  },
}));

import { GraphMailboxProvider } from "./graph-mailbox";

type Appel = { url: string; methode: string; corps?: unknown };
let appels: Appel[];

beforeEach(() => {
  appels = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    appels.push({ url, methode: init?.method ?? "GET", corps: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return new Response("{}", { status: url.includes("id-<refus>") ? 403 : 201 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("GraphMailboxProvider.mettreALaCorbeille", () => {
  it("déplace chaque mail vers deleteditems (jamais un DELETE)", async () => {
    const r = await new GraphMailboxProvider().mettreALaCorbeille({ boite: "moi@real31.fr", internetMessageIds: ["<a>", "<b>"] });
    expect(r).toEqual({ deplaces: ["<a>", "<b>"], echecs: [] });
    expect(appels.map((a) => a.methode)).toEqual(["POST", "POST"]);
    expect(appels[0]!.url).toBe("https://graph/users/moi%40real31.fr/messages/id-<a>/move");
    expect(appels[0]!.corps).toEqual({ destinationId: "deleteditems" });
  });

  it("un mail introuvable ou refusé n'empêche pas les autres", async () => {
    const r = await new GraphMailboxProvider().mettreALaCorbeille({
      boite: "moi@real31.fr",
      internetMessageIds: ["<absent>", "<refus>", "<c>"],
    });
    expect(r).toEqual({ deplaces: ["<c>"], echecs: ["<absent>", "<refus>"] });
  });
});
