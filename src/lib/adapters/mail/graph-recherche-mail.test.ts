// Vue « Envoyés » de l'écran E-mails (REA-341) : lecture du dossier sentitems, date = date
// d'envoi, boîte illisible signalée. Faux fetch, zéro réseau.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./graph-auth", () => ({
  GRAPH: "https://graph",
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { GraphRechercheMail } from "./graph-recherche-mail";
import { BoiteNonLisible } from "@/lib/domain/echanges";

afterEach(() => vi.unstubAllGlobals());

describe("GraphRechercheMail.envoyes", () => {
  it("lit sentitems trié par date d'envoi, et date chaque mail à son envoi", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          value: [
            {
              id: "g1",
              internetMessageId: "<m1>",
              subject: "RE: Fuite",
              from: { emailAddress: { address: "Moi@real31.fr", name: "Moi" } },
              toRecipients: [{ emailAddress: { address: "client@x.fr" } }],
              receivedDateTime: "2026-10-16T08:00:00Z",
              sentDateTime: "2026-10-16T07:59:58Z",
              bodyPreview: "Bonjour",
            },
          ],
        }),
        { status: 200 },
      );
    });
    const l = await new GraphRechercheMail().envoyes({ boite: "moi@real31.fr", max: 30 });
    expect(urls[0]).toContain("/users/moi%40real31.fr/mailFolders/sentitems/messages?$orderby=sentDateTime%20desc&$top=30");
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: "g1", objet: "RE: Fuite", a: ["client@x.fr"], date: "2026-10-16T07:59:58Z", apercu: "Bonjour" });
  });

  it("boîte partagée : les envoyés depuis une date, page après page, bornés au plafond (30/10/2026)", async () => {
    const urls: string[] = [];
    const page = (n: number, suite?: string) => ({
      value: Array.from({ length: n }, (_, i) => ({ id: `g${urls.length}-${i}`, subject: "S062 - devis", receivedDateTime: "2026-10-20T08:00:00Z" })),
      ...(suite ? { "@odata.nextLink": suite } : {}),
    });
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(urls.length === 1 ? page(250, "https://graph/suite1") : page(250, "https://graph/suite2")), { status: 200 });
    });
    const l = await new GraphRechercheMail().envoyes({ boite: "syndic2@real31.fr", max: 400, depuis: "2026-10-16T10:00:00.000Z" });
    expect(urls[0]).toContain("$orderby=sentDateTime%20desc&$filter=sentDateTime%20ge%202026-10-16T10%3A00%3A00Z&$top=250");
    expect(urls).toEqual([urls[0], "https://graph/suite1"]);
    expect(l).toHaveLength(400);
  });

  it("le plafond de sécurité : 1 000 envoyés au plus, même si on en demande plus", async () => {
    let appels = 0;
    vi.stubGlobal("fetch", async () => {
      appels++;
      const value = Array.from({ length: 250 }, (_, i) => ({ id: `g${appels}-${i}`, subject: "x", receivedDateTime: "2026-10-20T08:00:00Z" }));
      return new Response(JSON.stringify({ value, "@odata.nextLink": "https://graph/suite" }), { status: 200 });
    });
    const l = await new GraphRechercheMail().envoyes({ boite: "syndic2@real31.fr", max: 5000, depuis: "2026-10-16T00:00:00Z" });
    expect(appels).toBe(4);
    expect(l).toHaveLength(1000);
  });

  it("une boîte refusée par Graph est dite illisible", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    await expect(new GraphRechercheMail().envoyes({ boite: "x@real31.fr", max: 30 })).rejects.toBeInstanceOf(BoiteNonLisible);
  });
});
