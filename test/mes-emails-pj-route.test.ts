import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";

// Pièces jointes en flux et dépôt par tranches (REA-421, 27/10/2026), de bout en bout côté
// serveur : les vraies routes avec leurs vraies gardes (session, boîte visible, mail distribué
// au binôme, garde du tri), le vrai adaptateur Graph sur un faux fetch, la session simulée.
// Deux boîtes triées : syndic4 (HLS) et syndic2 (LGC). Données inventées.

const etat = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  repo: null as unknown as MockTriRepository,
  graph: [] as string[],
  sortant: [] as string[],
  incarnation: false,
  delegations: [] as Record<string, unknown>[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  incarnationEnCours: async () => etat.incarnation,
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
  // Délégations (ADR-041) et collaborateurs, en mémoire : la boîte perso de Fanny pour Emmanuel.
  getDelegationRepository: () => ({
    listerPourBeneficiaire: async (id: string) => etat.delegations.filter((d) => d.aUserId === id),
  }),
  getGestionnaireRepository: () => ({
    findById: async (id: string) => [sophie, emmanuel, fanny].find((p) => p.id === id) ?? null,
  }),
  getAgenceRepository: () => ({
    listerAgences: async () => [
      { id: "ag-hls", code: "HLS" },
      { id: "ag-lgc", code: "LGC" },
    ],
  }),
  getMailOutboundProvider: () => ({
    ajouterPieceJointe: async (p: { draftId: string; nom: string; octets: Uint8Array }) => {
      etat.sortant.push(`joint ${p.nom} (${p.octets.byteLength}) sur ${p.draftId}`);
    },
    ouvrirSessionUpload: async (p: { draftId: string; taille: number }) => {
      etat.sortant.push(`session ${p.taille} sur ${p.draftId}`);
      return { uploadUrl: "https://upload/secret" };
    },
    envoyerTranche: async (p: { uploadUrl: string; debut: number; octets: Uint8Array; taille: number }) => {
      etat.sortant.push(`tranche ${p.debut} (${p.octets.byteLength}) vers ${p.uploadUrl}`);
      return { fini: p.debut + p.octets.byteLength >= p.taille };
    },
  }),
}));

const { GET: getMesEmails } = await import("@/app/mes-emails/pj/route");
const { GET: getTri } = await import("@/app/tri-emails/pj/route");
const { POST: deposer } = await import("@/app/mes-emails/pj/depot/route");
const { scellerJeton } = await import("@/lib/services/mes-emails/jeton-envoi");
const { TRANCHE_UPLOAD } = await import("@/lib/domain/piece-jointe-flux");

const SYNDIC4 = "syndic4@real31.fr";
const SYNDIC2 = "syndic2@real31.fr";
const sophie = { id: "u1", nomComplet: "Sophie K", initiales: "SK", email: "sophie@real31.fr", agencyId: "ag-hls", role: "GESTIONNAIRE" };
const emmanuel = { id: "u5", nomComplet: "Emmanuel LOPES", initiales: "EL", email: "emmanuel@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
const fanny = { id: "u6", nomComplet: "Fanny SORIVELLE", initiales: "FS", email: "fanny@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };

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
  vi.stubEnv("AUTH_SECRET", "secret-de-test");
  vi.stubEnv(
    "MAIL_TRI_BOITES",
    JSON.stringify([
      { boite: SYNDIC4, agences: ["HLS"], ecriture: false, automatique: false, envoi: false },
      { boite: SYNDIC2, agences: ["LGC"], ecriture: false, automatique: false, envoi: false },
    ]),
  );
  etat.repo = new MockTriRepository({ binomes: [], parCopro: {} });
  etat.graph = [];
  etat.sortant = [];
  etat.session = sophie;
  etat.incarnation = false;
  etat.delegations = [];
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

describe("POST /mes-emails/pj/depot : un fichier déposé par tranches sur le brouillon", () => {
  const jeton = (gid = "u1") =>
    scellerJeton({ nature: "brouillon", boite: SYNDIC4, draftId: "br1", gid, mode: "brouillon", emailId: "<a-sophie@x>", coproCode: "S0297", boiteMessage: SYNDIC4, exp: Date.now() + 60_000 });
  const tranche = (champs: Record<string, string>, octets: number) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) fd.set(k, v);
    fd.set("tranche", new Blob([new Uint8Array(octets)]), "tranche");
    return new NextRequest("http://localhost/mes-emails/pj/depot", { method: "POST", body: fd });
  };

  it("sans session : 401", async () => {
    etat.session = null;
    expect((await deposer(tranche({ jeton: jeton(), nom: "a.pdf", type: "application/pdf", taille: "10", debut: "0" }, 10))).status).toBe(401);
  });

  it("jeton d'un autre gestionnaire ou falsifié : 410, rien n'est joint", async () => {
    expect((await deposer(tranche({ jeton: jeton("u2"), nom: "a.pdf", type: "", taille: "10", debut: "0" }, 10))).status).toBe(410);
    expect((await deposer(tranche({ jeton: "abc", nom: "a.pdf", type: "", taille: "10", debut: "0" }, 10))).status).toBe(410);
    expect(etat.sortant).toEqual([]);
  });

  it("petit fichier : joint en un coup", async () => {
    const r = await deposer(tranche({ jeton: jeton(), nom: "a.pdf", type: "application/pdf", taille: "10", debut: "0" }, 10));
    expect(await r.json()).toEqual({ ok: true, fini: true });
    expect(etat.sortant).toEqual(["joint a.pdf (10) sur br1"]);
  });

  it("fichier de 5 Mo : session ouverte à la première tranche, URL de session jamais rendue en clair", async () => {
    const taille = 5 * 1024 * 1024;
    const champs = { jeton: jeton(), nom: "plan.pdf", type: "application/pdf", taille: String(taille) };
    const r1 = await deposer(tranche({ ...champs, debut: "0" }, TRANCHE_UPLOAD));
    const j1 = (await r1.json()) as { ok: boolean; fini: boolean; session: string };
    expect(j1.ok && !j1.fini).toBe(true);
    expect(JSON.stringify(j1)).not.toContain("upload/secret");
    const r2 = await deposer(tranche({ ...champs, debut: String(TRANCHE_UPLOAD), session: j1.session }, taille - TRANCHE_UPLOAD));
    expect(await r2.json()).toEqual({ ok: true, fini: true });
    expect(etat.sortant).toEqual([
      `session ${taille} sur br1`,
      `tranche 0 (${TRANCHE_UPLOAD}) vers https://upload/secret`,
      `tranche ${TRANCHE_UPLOAD} (${taille - TRANCHE_UPLOAD}) vers https://upload/secret`,
    ]);
  });

  it("au-delà de 25 Mo : 413 ; tranche mal découpée : 400", async () => {
    expect((await deposer(tranche({ jeton: jeton(), nom: "gros.zip", type: "", taille: String(26 * 1024 * 1024), debut: "0" }, 10))).status).toBe(413);
    expect((await deposer(tranche({ jeton: jeton(), nom: "a.pdf", type: "", taille: "10", debut: "0" }, 9))).status).toBe(400);
  });
});

describe("GET /mes-emails/pj : la boîte perso d'un titulaire, par délégation de portefeuille (27/10/2026)", () => {
  const pjDeFanny = () => getMesEmails(url("/mes-emails/pj", { boite: "fanny@real31.fr", message: "<perso-fanny@x>", pj: "AAMk", inline: "1" }));
  const deleguer = (x: Record<string, unknown> = {}) =>
    etat.delegations.push({ id: "d1", deUserId: fanny.id, aUserId: emmanuel.id, portee: "portefeuille", depuisISO: "2000-01-01", jusquaISO: "2999-12-31", ...x });

  it("sans délégation : 403, Graph n'est pas appelé", async () => {
    etat.session = emmanuel;
    expect((await pjDeFanny()).status).toBe(403);
    expect(etat.graph).toEqual([]);
  });

  it("avec une délégation de portefeuille active : la pièce, lue dans la boîte de Fanny", async () => {
    etat.session = emmanuel;
    deleguer();
    const r = await pjDeFanny();
    expect(r.status).toBe(200);
    expect(etat.graph[0]).toMatch(/^fanny%40real31\.fr\/messages\//);
  });

  it("délégation d'agence ou expirée : 403", async () => {
    etat.session = emmanuel;
    deleguer({ portee: "agence", agenceCode: "LGC" });
    deleguer({ id: "d2", jusquaISO: "2001-01-01" });
    expect((await pjDeFanny()).status).toBe(403);
    expect(etat.graph).toEqual([]);
  });

  it("en incarnation : jamais la boîte perso du titulaire, même avec la délégation", async () => {
    etat.session = emmanuel;
    etat.incarnation = true;
    deleguer();
    expect((await pjDeFanny()).status).toBe(403);
    expect(etat.graph).toEqual([]);
  });
});
