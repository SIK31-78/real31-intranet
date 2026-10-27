// Lecture incrementale de la reception (REA-419) : pagination jusqu'au deltaLink, entrees
// @removed, budget de temps, jeton expire -> relecture complete. Faux fetch, zero reseau.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./graph-auth", () => ({
  GRAPH: "https://graph",
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { GraphReceptionDelta, urlInitiale } from "./graph-reception-delta";

afterEach(() => vi.unstubAllGlobals());

const BOITE = "syndic4@real31.fr";
const DEPUIS = "2026-10-04T22:00:00Z";

const message = (n: number) => ({
  id: `g${n}`,
  internetMessageId: `<m${n}@exemple.fr>`,
  conversationId: `c${n}`,
  subject: `Objet ${n}`,
  from: { emailAddress: { address: `x${n}@exemple.fr`, name: `X ${n}` } },
  toRecipients: [{ emailAddress: { address: BOITE } }],
  receivedDateTime: `2026-10-2${n}T08:00:00Z`,
  body: { content: `Corps ${n}` },
  hasAttachments: n === 2,
  webLink: `https://outlook/${n}`,
});

/** Un faux Graph qui rend les reponses dans l'ordre et garde les requetes. */
function graph(reponses: Response[]) {
  const appels: { url: string; prefer: string | null }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    appels.push({ url, prefer: new Headers(init?.headers).get("prefer") });
    const r = reponses.shift();
    if (!r) throw new Error(`appel en trop : ${url}`);
    return r;
  });
  return appels;
}

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status });

describe("GraphReceptionDelta", () => {
  it("premier passage : filtre sur la date, texte brut, pages de 50, suit nextLink jusqu'au deltaLink", async () => {
    const appels = graph([
      json({ value: [message(1), message(2)], "@odata.nextLink": "https://graph/next1" }),
      json({ value: [message(3)], "@odata.deltaLink": "https://graph/delta1" }),
    ]);
    const r = await new GraphReceptionDelta().lireDelta(BOITE, { jeton: null, depuis: DEPUIS, budgetMs: 20_000 });

    expect(appels[0]!.url).toBe(urlInitiale(BOITE, DEPUIS));
    expect(appels[0]!.url).toContain("/users/syndic4%40real31.fr/mailFolders/inbox/messages/delta?$select=id,internetMessageId,");
    expect(appels[0]!.url).toContain("&$filter=receivedDateTime%20ge%202026-10-04T22%3A00%3A00Z");
    expect(appels[0]!.prefer).toBe('outlook.body-content-type="text", odata.maxpagesize=50');
    expect(appels[1]!.url).toBe("https://graph/next1");
    expect(appels[1]!.prefer).toContain('outlook.body-content-type="text"');
    expect(r).toMatchObject({ pages: 2, jeton: "https://graph/delta1", complet: true, reinitialise: true, retires: [] });
    expect(r.ajoutes.map((m) => m.internetMessageId)).toEqual(["<m1@exemple.fr>", "<m2@exemple.fr>", "<m3@exemple.fr>"]);
    expect(r.ajoutes[1]).toMatchObject({
      id: "g2",
      from: "x2@exemple.fr",
      fromName: "X 2",
      to: [BOITE],
      subject: "Objet 2",
      bodyText: "Corps 2",
      attachments: [{ name: "piece jointe" }],
      webLink: "https://outlook/2",
    });
  });

  it("passage suivant : repart du jeton, les @removed sont des retraits, une entree partielle est ignoree", async () => {
    const appels = graph([
      json({
        value: [message(4), { id: "g1", "@removed": { reason: "deleted" } }, { id: "g2", isRead: true }],
        "@odata.deltaLink": "https://graph/delta2",
      }),
    ]);
    const r = await new GraphReceptionDelta().lireDelta(BOITE, { jeton: "https://graph/delta1", depuis: DEPUIS, budgetMs: 20_000 });
    expect(appels.map((a) => a.url)).toEqual(["https://graph/delta1"]);
    expect(r).toMatchObject({ pages: 1, retires: ["g1"], jeton: "https://graph/delta2", complet: true, reinitialise: false });
    expect(r.ajoutes.map((m) => m.id)).toEqual(["g4"]);
  });

  it("budget de temps atteint : s'arrete apres la page en cours, le nextLink devient le jeton", async () => {
    let t = 0;
    const appels = graph([
      json({ value: [message(1)], "@odata.nextLink": "https://graph/next1" }),
      json({ value: [message(2)], "@odata.nextLink": "https://graph/next2" }),
    ]);
    const r = await new GraphReceptionDelta().lireDelta(BOITE, {
      jeton: null,
      depuis: DEPUIS,
      budgetMs: 5_000,
      maintenant: () => (t += 3_000),
    });
    expect(appels).toHaveLength(2);
    expect(r).toMatchObject({ pages: 2, jeton: "https://graph/next2", complet: false });
    expect(r.ajoutes).toHaveLength(2);
  });

  it.each([
    ["410 Gone", json({ error: { code: "SyncStateNotFound" } }, 410)],
    ["syncStateNotFound", json({ error: { code: "syncStateNotFound", message: "x" } }, 400)],
    ["jeton illisible", json({ error: { code: "BadRequest", message: "Badly formed token." } }, 400)],
  ])("jeton expire (%s) : relecture complete depuis la mise en service", async (_cas, refus) => {
    const appels = graph([refus, json({ value: [message(5)], "@odata.deltaLink": "https://graph/delta-neuf" })]);
    const r = await new GraphReceptionDelta().lireDelta(BOITE, { jeton: "https://graph/vieux", depuis: DEPUIS, budgetMs: 20_000 });
    expect(appels.map((a) => a.url)).toEqual(["https://graph/vieux", urlInitiale(BOITE, DEPUIS)]);
    expect(r).toMatchObject({ reinitialise: true, complet: true, jeton: "https://graph/delta-neuf" });
    expect(r.ajoutes.map((m) => m.id)).toEqual(["g5"]);
  });

  it("une boite refusee n'est pas un jeton expire : l'erreur remonte", async () => {
    graph([json({ error: { code: "ErrorAccessDenied" } }, 403)]);
    await expect(new GraphReceptionDelta().lireDelta(BOITE, { jeton: "https://graph/delta1", budgetMs: 20_000 })).rejects.toThrow(/403/);
  });

  it("une relecture complete refusee ne boucle pas", async () => {
    const appels = graph([json({ error: { code: "BadRequest", message: "Invalid filter token" } }, 400)]);
    await expect(new GraphReceptionDelta().lireDelta(BOITE, { jeton: null, depuis: DEPUIS, budgetMs: 20_000 })).rejects.toThrow(/400/);
    expect(appels).toHaveLength(1);
  });
});
