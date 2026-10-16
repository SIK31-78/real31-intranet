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

  it("une boîte refusée par Graph est dite illisible", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    await expect(new GraphRechercheMail().envoyes({ boite: "x@real31.fr", max: 30 })).rejects.toBeInstanceOf(BoiteNonLisible);
  });
});
