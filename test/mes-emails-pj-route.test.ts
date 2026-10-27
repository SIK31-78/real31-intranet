import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";

// Pièces jointes en flux (REA-421, 27/10/2026), de bout en bout côté
// serveur : les vraies routes avec leurs vraies gardes (session, boîte visible, mail distribué
// au binôme, garde du tri), le vrai adaptateur Graph sur un faux fetch, la session simulée.
// Deux boîtes triées : syndic4 (HLS) et syndic2 (LGC). Données inventées.

const etat = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  repo: null as unknown as MockTriRepository,
  graph: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
}));
vi.mock("@/lib/adapters/mail/graph-auth", () => ({
  GRAPH: "https://graph",
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
  resoudreMessageId: async (_tk: string, _boite: string, imid: string) => (imid === "<disparu@x>" ? Promise.reject(new Error("Message introuvable dans la boite.")) : "g1"),
}));
vi.mock("@/lib/adapters/router", async (original) => ({
  ...(await original<typeof import("@/lib/adapters/router")>()),
  getTriRepository: () => etat.repo,
  getAgenceRepository: () => ({
    listerAgences: async () => [
      { id: "ag-hls", code: "HLS" },
      { id: "ag-lgc", code: "LGC" },
    ],
  }),
}));

const { GET: getMesEmails } = await import("@/app/mes-emails/pj/route");
const { GET: getTri } = await import("@/app/tri-emails/pj/route");

const SYNDIC4 = "syndic4@real31.fr";
const SYNDIC2 = "syndic2@real31.fr";
const sophie = { id: "u1", nomComplet: "Sophie K", initiales: "SK", email: "sophie@real31.fr", agencyId: "ag-hls", role: "GESTIONNAIRE" };

const ranger = (boite: string, imid: string, gestionnaire: string) =>
  etat.repo.journaliser({
    boite,
    internetMessageId: imid,
    messageId: imid,
    expediteur: "client@exemple.fr",
    objet: "Fuite",
    coproReference: "S0297",
    copros: ["S0297"],
    dossierNom: "XX",
    dossierCle: `binome:${gestionnaire}`,
    signal: null,
    candidats: [],
    simulation: true,
    par: "tri",
  });

/** Graph : la pièce `nom` (type déclaré `type`), contenu « %PDF… ». */
function graphRend(nom: string, type: string) {
  vi.stubGlobal("fetch", async (url: string) => {
    etat.graph.push(url.replace("https://graph/users/", ""));
    if (url.endsWith("/$value")) return new Response("%PDF-1.7 contenu", { headers: { "Content-Type": type } });
    return Response.json({ name: nom, contentType: type, size: 1234 });
  });
}

const url = (chemin: string, q: Record<string, string>) => new NextRequest(`http://localhost${chemin}?${new URLSearchParams(q).toString()}`);

beforeEach(async () => {
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
  vi.stubEnv("MAIL_SOURCE", "graph");
  vi.stubEnv(
    "MAIL_TRI_BOITES",
    JSON.stringify([
      { boite: SYNDIC4, agences: ["HLS"], ecriture: false, automatique: false, envoi: false },
      { boite: SYNDIC2, agences: ["LGC"], ecriture: false, automatique: false, envoi: false },
    ]),
  );
  etat.repo = new MockTriRepository({ binomes: [], parCopro: {} });
  etat.graph = [];
  etat.session = sophie;
  graphRend("Devis toiture été.pdf", "application/octet-stream");
  await ranger(SYNDIC4, "<a-sophie@x>", "sophie@real31.fr");
  await ranger(SYNDIC4, "<b-marc@x>", "marc@real31.fr");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /mes-emails/pj : la pièce en flux", () => {
  it("sans session : 401, Graph n'est pas appelé", async () => {
    etat.session = null;
    const r = await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<a-sophie@x>", pj: "AAMk=" }));
    expect(r.status).toBe(401);
    expect(etat.graph).toEqual([]);
  });

  it("paramètres invalides : 400 (id de pièce hors base64, message absent)", async () => {
    expect((await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<a-sophie@x>", pj: "../../me" }))).status).toBe(400);
    expect((await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, pj: "AAMk" }))).status).toBe(400);
    expect(etat.graph).toEqual([]);
  });

  it("mail d'un autre binôme de la boîte partagée : 403, Graph n'est pas appelé", async () => {
    const r = await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<b-marc@x>", pj: "AAMk" }));
    expect(r.status).toBe(403);
    expect(etat.graph).toEqual([]);
  });

  it("boîte d'une autre agence : 403", async () => {
    expect((await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC2, message: "<a-sophie@x>", pj: "AAMk" }))).status).toBe(403);
  });

  it("aperçu d'un PDF étiqueté octet-stream : type corrigé, en ligne, nom RFC 5987, rien en cache", async () => {
    const r = await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<a-sophie@x>", pj: "AAMk/x+y=", inline: "1" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe(`inline; filename="Devis toiture _t_.pdf"; filename*=UTF-8''Devis%20toiture%20%C3%A9t%C3%A9.pdf`);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("content-length")).toBeNull();
    expect(await r.text()).toBe("%PDF-1.7 contenu");
    // Métadonnées puis contenu brut, dans la boîte du mail.
    expect(etat.graph).toEqual([
      "syndic4%40real31.fr/messages/g1/attachments/AAMk%2Fx%2By%3D?$select=name,contentType,size",
      "syndic4%40real31.fr/messages/g1/attachments/AAMk%2Fx%2By%3D/$value",
    ]);
  });

  it("téléchargement (inline=0) : attachment, dans un bac à sable", async () => {
    const r = await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<a-sophie@x>", pj: "AAMk", inline: "0" }));
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; /);
    expect(r.headers.get("content-security-policy")).toMatch(/^sandbox/);
  });

  it("une pièce HTML ne s'affiche jamais en ligne, même demandée en aperçu", async () => {
    graphRend("piege.html", "text/html");
    const r = await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<a-sophie@x>", pj: "AAMk", inline: "1" }));
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; /);
    expect(r.headers.get("content-security-policy")).toMatch(/^sandbox/);
  });

  it("mail disparu de la boîte : 404", async () => {
    etat.session = { ...sophie, email: "sekou@real31.fr" };
    const r = await getMesEmails(url("/mes-emails/pj", { boite: SYNDIC4, message: "<disparu@x>", pj: "AAMk" }));
    expect(r.status).toBe(404);
  });
});

describe("GET /tri-emails/pj : garde du tri", () => {
  it("sans session : 401", async () => {
    etat.session = null;
    expect((await getTri(url("/tri-emails/pj", { boite: SYNDIC4, message: "<a@x>", pj: "AAMk" }))).status).toBe(401);
  });

  it("boîte manquante : 400", async () => {
    expect((await getTri(url("/tri-emails/pj", { message: "<a@x>", pj: "AAMk" }))).status).toBe(400);
  });

  it("la boîte d'une autre agence : 403 ; la sienne : la pièce", async () => {
    expect((await getTri(url("/tri-emails/pj", { boite: SYNDIC2, message: "<a@x>", pj: "AAMk", inline: "1" }))).status).toBe(403);
    const r = await getTri(url("/tri-emails/pj", { boite: SYNDIC4, message: "<a@x>", pj: "AAMk", inline: "1" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/^inline; /);
  });
});
