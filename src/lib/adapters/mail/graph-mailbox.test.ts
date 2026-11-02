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

import { GraphMailboxProvider, parcourirArborescence } from "./graph-mailbox";

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

// REA-422 (27/10/2026) : le lu de l'intranet est écrit dans Outlook, et relu.
describe("GraphMailboxProvider.marquerLu", () => {
  it("PATCH du message avec { isRead: true }", async () => {
    await new GraphMailboxProvider().marquerLu({ boite: "syndic4@real31.fr", internetMessageId: "<a>", lu: true });
    expect(appels).toEqual([{ url: "https://graph/users/syndic4%40real31.fr/messages/id-<a>", methode: "PATCH", corps: { isRead: true } }]);
  });

  it("un refus de Graph remonte en erreur (l'appelant décide)", async () => {
    await expect(new GraphMailboxProvider().marquerLu({ boite: "moi@real31.fr", internetMessageId: "<refus>", lu: true })).rejects.toThrow(/Graph lu 403/);
  });
});

describe("GraphMailboxProvider.lireEtatsLu", () => {
  const repondre = (pages: Record<string, unknown>) =>
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push({ url, methode: "GET" });
      const cle = Object.keys(pages).find((k) => url.includes(k));
      return new Response(JSON.stringify(cle ? pages[cle] : { value: [] }), { status: 200 });
    });

  it("par identifiants : lots de 10, une copie non lue l'emporte sur une copie lue", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `<m${i}>`);
    repondre({
      [encodeURIComponent("internetMessageId eq '<m0>'")]: {
        value: [
          { internetMessageId: "<m0>", isRead: true },
          { internetMessageId: "<m1>", isRead: false },
          { internetMessageId: "<m1>", isRead: true },
        ],
      },
      [encodeURIComponent("internetMessageId eq '<m10>'")]: { value: [{ internetMessageId: "<m11>", isRead: true }] },
    });
    const lus = await new GraphMailboxProvider().lireEtatsLu({ boite: "syndic4@real31.fr", internetMessageIds: ids });
    expect(appels).toHaveLength(2);
    expect(appels[0]!.url).toContain("$select=internetMessageId,isRead");
    expect([...lus]).toEqual([
      ["<m0>", true],
      ["<m1>", false],
      ["<m11>", true],
    ]);
  });

  it("les N plus récents de la réception, pages suivies", async () => {
    repondre({
      "mailFolders/inbox/messages?$top=3": { value: [{ internetMessageId: "<a>", isRead: true }], "@odata.nextLink": "https://graph/page2" },
      "page2": { value: [{ internetMessageId: "<b>", isRead: false }] },
    });
    const lus = await new GraphMailboxProvider().lireEtatsLu({ boite: "moi@real31.fr", recents: 3 });
    expect(appels.map((a) => a.url)).toEqual([
      "https://graph/users/moi%40real31.fr/mailFolders/inbox/messages?$top=3&$orderby=receivedDateTime desc&$select=internetMessageId,isRead",
      "https://graph/page2",
    ]);
    expect(Object.fromEntries(lus)).toEqual({ "<a>": true, "<b>": false });
  });
});

// Toute l'arborescence de la boîte perso (02/11/2026) : chemins, bornes, dossiers système.
describe("parcourirArborescence", () => {
  const f = (id: string, displayName: string, childFolderCount = 0) => ({ id, displayName, childFolderCount });
  const arbre: Record<string, ReturnType<typeof f>[]> = {
    inbox: [f("copros", "Copros", 2), f("sk", "SK-CP")],
    copros: [f("s270", "S270 - Le Cyrano", 1), f("s300", "S300 - Moulin")],
    s270: [f("s270-2025", "2025")],
    perso: [f("fact", "Factures")],
    del: [f("vieux", "Vieux")],
  };
  const racines = [f("inbox", "Boîte de réception", 2), f("perso", "Perso", 1), f("del", "Éléments supprimés", 1), f("vide", "Vide")];

  it("rend les chemins « Parent / Enfant », la profondeur sous la réception, sans ouvrir les dossiers système ni les feuilles", async () => {
    const appels: string[] = [];
    const { dossiers, tronque } = await parcourirArborescence(racines, "inbox", async (id) => {
      appels.push(id);
      return arbre[id] ?? [];
    });
    expect(tronque).toBe(false);
    expect(appels.sort()).toEqual(["copros", "inbox", "perso", "s270"]);
    const vue = Object.fromEntries(dossiers.map((d) => [d.id, [d.chemin ?? d.nom, d.niveau]]));
    expect(vue).toMatchObject({
      sk: ["SK-CP", 1],
      s270: ["Copros / S270 - Le Cyrano", 2],
      "s270-2025": ["Copros / S270 - Le Cyrano / 2025", 3],
      fact: ["Perso / Factures", 0],
      del: ["Éléments supprimés", 0],
    });
    expect(vue.vieux).toBeUndefined();
  });

  it("borne la profondeur et le nombre de dossiers", async () => {
    const enfants = async (id: string) => arbre[id] ?? [];
    const court = await parcourirArborescence(racines, "inbox", enfants, { profondeur: 1, max: 100 });
    expect(court.tronque).toBe(true);
    expect(court.dossiers.some((d) => d.id === "s270")).toBe(false);
    const peu = await parcourirArborescence(racines, "inbox", enfants, { profondeur: 6, max: 5 });
    expect(peu.dossiers).toHaveLength(5);
    expect(peu.tronque).toBe(true);
  });
});
