// Transfert depuis l'écran E-mails (REA-350) : createForward (les pièces jointes d'origine
// suivent), mon texte et ma signature au-dessus du message transféré, puis envoi ou
// brouillon. Faux fetch, zéro réseau.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./graph-auth", () => ({
  GRAPH: "https://graph",
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
  resoudreMessageId: async () => "g1",
}));

import { GraphMailOutboundProvider } from "./graph-mail-outbound";

type Appel = { url: string; methode: string; corps?: Record<string, unknown> };
let appels: Appel[];

beforeEach(() => {
  appels = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    appels.push({ url, methode: init?.method ?? "GET", corps: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/createForward")) {
      return new Response(JSON.stringify({ id: "tr1", webLink: "https://outlook/tr1", body: { content: "<p>message d'origine</p>" } }), { status: 201 });
    }
    return new Response("{}", { status: 202 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const base = {
  boite: "moi@real31.fr",
  internetMessageId: "<m1>",
  a: ["elsa@real31.fr"],
  cc: ["x@ext.fr"],
  corps: "Pour suite à donner\n<merci>",
  signatureHtml: "<p>Sig</p>",
};

describe("GraphMailOutboundProvider.transferer", () => {
  it("crée le transfert, pose texte + signature au-dessus du message transféré, puis l'envoie", async () => {
    const r = await new GraphMailOutboundProvider().transferer({ ...base, envoyer: true });
    expect(r).toEqual({});
    expect(appels.map((a) => `${a.methode} ${a.url.replace("https://graph/users/moi%40real31.fr", "")}`)).toEqual([
      "POST /messages/g1/createForward",
      "PATCH /messages/tr1",
      "POST /messages/tr1/send",
    ]);
    const patch = appels[1]!.corps as { body: { content: string }; toRecipients: unknown; ccRecipients: unknown };
    expect(patch.body.content).toContain("Pour suite à donner<br/>&lt;merci&gt;");
    expect(patch.body.content.indexOf("<p>Sig</p>")).toBeLessThan(patch.body.content.indexOf("message d'origine"));
    expect(patch.toRecipients).toEqual([{ emailAddress: { address: "elsa@real31.fr" } }]);
    expect(patch.ccRecipients).toEqual([{ emailAddress: { address: "x@ext.fr" } }]);
  });

  it("en brouillon : rien n'est envoyé, le lien Outlook est rendu", async () => {
    const r = await new GraphMailOutboundProvider().transferer({ ...base, envoyer: false });
    expect(r).toEqual({ webLink: "https://outlook/tr1" });
    expect(appels.some((a) => a.url.endsWith("/send"))).toBe(false);
  });

  it("refuse un transfert sans destinataire", async () => {
    await expect(new GraphMailOutboundProvider().transferer({ ...base, a: [], envoyer: true })).rejects.toThrow(/destinataire/);
  });
});
