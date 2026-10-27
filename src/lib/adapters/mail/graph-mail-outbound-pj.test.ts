// Pièces jointes de plus de 3 Mo sur une réponse (REA-421, 27/10/2026) : la pièce d'origine
// est lue en octets ($value), puis jointe par un POST simple sous 3 Mo, par session d'upload
// au-delà (PUT par tranches avec Content-Range, 201 à la dernière). Un échec en route supprime
// le brouillon. Faux fetch, zéro réseau.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANCHE_UPLOAD } from "@/lib/domain/piece-jointe-flux";

vi.mock("./graph-auth", () => ({
  GRAPH: "https://graph",
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
  resoudreMessageId: async () => "g1",
}));

import { GraphMailOutboundProvider } from "./graph-mail-outbound";

type Appel = { url: string; methode: string; plage?: string | null; auth?: string | null; octets?: number };
let appels: Appel[];
/** Taille du contenu de la pièce d'origine ($value). */
let tailleOrigine: number;
/** Le PUT de la tranche n° k (0, 1…) échoue. */
let trancheEnEchec: number | null;

const MO = 1024 * 1024;

beforeEach(() => {
  appels = [];
  tailleOrigine = 1000;
  trancheEnEchec = null;
  let puts = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const methode = init?.method ?? "GET";
    appels.push({
      url: url.replace("https://graph/users/syndic4%40real31.fr", ""),
      methode,
      plage: h.get("content-range"),
      auth: h.get("authorization"),
      ...(init?.body instanceof Uint8Array ? { octets: init.body.byteLength } : {}),
    });
    if (url.endsWith("/createReply")) return Response.json({ id: "br1", webLink: "https://outlook/br1", body: { content: "<p>cité</p>" } }, { status: 201 });
    if (url.includes("/attachments/pj1?")) return Response.json({ "@odata.type": "#microsoft.graph.fileAttachment", name: "plan.pdf", contentType: "application/pdf", size: tailleOrigine + 300 });
    if (url.endsWith("/attachments/pj1/$value")) return new Response(new Uint8Array(tailleOrigine));
    if (url.endsWith("/createUploadSession")) return Response.json({ uploadUrl: "https://upload/session1" }, { status: 201 });
    if (url.startsWith("https://upload/")) {
      const k = puts++;
      if (k === trancheEnEchec) return new Response("refus", { status: 500 });
      const [, fin, total] = /bytes \d+-(\d+)\/(\d+)/.exec(h.get("content-range") ?? "") ?? [];
      return Number(fin) + 1 === Number(total) ? new Response("{}", { status: 201 }) : Response.json({ nextExpectedRanges: [`${Number(fin) + 1}-`] });
    }
    return new Response("{}", { status: methode === "POST" ? 201 : 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const reponse = { boite: "syndic4@real31.fr", internetMessageId: "<m1>", corps: "Bonjour", a: ["x@y.fr"], cc: [], cci: [], pjIds: ["pj1"] };
const resume = () => appels.map((a) => `${a.methode} ${a.url}${a.plage ? ` [${a.plage}]` : ""}`);

describe("pièce d'origine re-jointe à une réponse", () => {
  it("sous 3 Mo : un POST simple, lue en octets ($value) et non en base64", async () => {
    const r = await new GraphMailOutboundProvider().preparerBrouillonReponse(reponse);
    expect(r).toEqual({ id: "br1", webLink: "https://outlook/br1" });
    expect(resume()).toEqual([
      "POST /messages/g1/createReply",
      "GET /messages/g1/attachments/pj1?$select=name,contentType,size",
      "GET /messages/g1/attachments/pj1/$value",
      "POST /messages/br1/attachments",
      "PATCH /messages/br1",
    ]);
  });

  it("plus de 3 Mo, une seule tranche : session d'upload, un PUT sans jeton, 201", async () => {
    tailleOrigine = 3.5 * MO;
    await new GraphMailOutboundProvider().preparerBrouillonReponse(reponse);
    const t = tailleOrigine;
    expect(resume()).toEqual([
      "POST /messages/g1/createReply",
      "GET /messages/g1/attachments/pj1?$select=name,contentType,size",
      "GET /messages/g1/attachments/pj1/$value",
      "POST /messages/br1/attachments/createUploadSession",
      `PUT https://upload/session1 [bytes 0-${t - 1}/${t}]`,
      "PATCH /messages/br1",
    ]);
    // L'URL de session porte sa propre autorisation : Graph refuse un Authorization en plus.
    expect(appels.find((a) => a.methode === "PUT")?.auth).toBeNull();
  });

  it("plusieurs tranches : des multiples de 320 Kio, dans l'ordre, la dernière plus courte", async () => {
    tailleOrigine = 9 * MO;
    await new GraphMailOutboundProvider().preparerBrouillonReponse(reponse);
    const puts = appels.filter((a) => a.methode === "PUT");
    const t = tailleOrigine;
    expect(puts.map((p) => p.plage)).toEqual([
      `bytes 0-${TRANCHE_UPLOAD - 1}/${t}`,
      `bytes ${TRANCHE_UPLOAD}-${2 * TRANCHE_UPLOAD - 1}/${t}`,
      `bytes ${2 * TRANCHE_UPLOAD}-${t - 1}/${t}`,
    ]);
    expect(TRANCHE_UPLOAD % (320 * 1024)).toBe(0);
    expect(puts.map((p) => p.octets)).toEqual([TRANCHE_UPLOAD, TRANCHE_UPLOAD, t - 2 * TRANCHE_UPLOAD]);
  });

  it("une tranche refusée en cours : le brouillon est supprimé, l'erreur remonte", async () => {
    tailleOrigine = 9 * MO;
    trancheEnEchec = 1;
    await expect(new GraphMailOutboundProvider().preparerBrouillonReponse(reponse)).rejects.toThrow(/tranche 500/);
    expect(resume().at(-1)).toBe("DELETE /messages/br1");
    expect(appels.some((a) => a.methode === "PATCH")).toBe(false);
  });
});

describe("fichier de l'ordinateur déposé sur le brouillon", () => {
  it("ajouterPieceJointe : session d'upload au-delà de 3 Mo, POST simple en dessous", async () => {
    const p = new GraphMailOutboundProvider();
    await p.ajouterPieceJointe({ boite: "syndic4@real31.fr", draftId: "br1", nom: "gros.pdf", contentType: "application/pdf", octets: new Uint8Array(5 * MO) });
    await p.ajouterPieceJointe({ boite: "syndic4@real31.fr", draftId: "br1", nom: "petit.pdf", contentType: "application/pdf", octets: new Uint8Array(10) });
    expect(resume()).toEqual([
      "POST /messages/br1/attachments/createUploadSession",
      `PUT https://upload/session1 [bytes 0-${TRANCHE_UPLOAD - 1}/${5 * MO}]`,
      `PUT https://upload/session1 [bytes ${TRANCHE_UPLOAD}-${5 * MO - 1}/${5 * MO}]`,
      "POST /messages/br1/attachments",
    ]);
  });

  it("envoyerTranche : 200 = la suite est attendue, 201 = pièce complète", async () => {
    const p = new GraphMailOutboundProvider();
    expect(await p.envoyerTranche({ uploadUrl: "https://upload/s", debut: 0, octets: new Uint8Array(10), taille: 20 })).toEqual({ fini: false });
    expect(await p.envoyerTranche({ uploadUrl: "https://upload/s", debut: 10, octets: new Uint8Array(10), taille: 20 })).toEqual({ fini: true });
  });

  it("supprimerBrouillon : DELETE du brouillon", async () => {
    await new GraphMailOutboundProvider().supprimerBrouillon({ boite: "syndic4@real31.fr", id: "br1" });
    expect(resume()).toEqual(["DELETE /messages/br1"]);
  });
});
