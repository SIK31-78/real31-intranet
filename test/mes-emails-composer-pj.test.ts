import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// « Envoyer un e-mail » avec de gros fichiers (27/10/2026) : le mail neuf passe par l'envoi en
// trois temps de la réponse (REA-421). De bout en bout côté serveur : les vraies actions du
// compositeur, la vraie route de dépôt, le vrai dépôt par tranches du navigateur
// (deposerFichier), le vrai adaptateur Graph sur un faux fetch. Données inventées.

const etat = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  graph: [] as string[],
  /** Le PUT de la tranche n° k (0, 1…) échoue. */
  trancheEnEchec: null as number | null,
  rattachements: [] as unknown[][],
  incarnation: false,
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
  resoudreMessageId: async () => "g1",
}));
vi.mock("@/lib/adapters/router", async (original) => ({
  ...(await original<typeof import("@/lib/adapters/router")>()),
  getDelegationRepository: () => ({ listerPourBeneficiaire: async () => [] }),
  getGestionnaireRepository: () => ({ findById: async () => null }),
  getAgenceRepository: () => ({
    listerAgences: async () => [
      { id: "ag-hls", code: "HLS" },
      { id: "ag-lgc", code: "LGC" },
      { id: "ag-ml", code: "ML" },
    ],
  }),
}));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => "<p>Sophie K</p>" }));
vi.mock("@/lib/services/dossiers/rattacher-email", () => ({
  rattacherEmailAuDossier: async (...args: unknown[]) => {
    etat.rattachements.push(args);
    return true;
  },
}));

const { preparerCompositionAction, finaliserCompositionAction, abandonnerCompositionAction } = await import("@/app/mes-emails/composer/actions");
const { POST: deposer } = await import("@/app/mes-emails/pj/depot/route");
const { deposerFichier } = await import("@/components/mes-emails/deposer-fichier");
const { scellerJeton } = await import("@/lib/services/mes-emails/jeton-envoi");

const SYNDIC4 = "syndic4@real31.fr";
const MO = 1024 * 1024;
const sophie = { id: "u1", nomComplet: "Sophie K", initiales: "SK", email: "sophie@real31.fr", agencyId: "ag-hls", role: "GESTIONNAIRE" };

/** Le faux réseau : la route de dépôt (appelée par deposerFichier) et Graph. */
function reseau() {
  let puts = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === "/mes-emails/pj/depot") {
      return deposer(new NextRequest("http://localhost/mes-emails/pj/depot", { method: "POST", body: init?.body as FormData }));
    }
    const methode = init?.method ?? "GET";
    const plage = new Headers(init?.headers).get("content-range");
    etat.graph.push(`${methode} ${url.replace(`https://graph/users/${encodeURIComponent(SYNDIC4)}`, "")}${plage ? ` [${plage}]` : ""}`);
    if (methode === "POST" && url.endsWith("/messages")) {
      return Response.json({ id: "nb1", webLink: "https://outlook/nb1", internetMessageId: "<neuf1@x>" }, { status: 201 });
    }
    if (url.endsWith("/createUploadSession")) return Response.json({ uploadUrl: "https://upload/s1" }, { status: 201 });
    if (url.startsWith("https://upload/")) {
      if (puts++ === etat.trancheEnEchec) return new Response("refus", { status: 500 });
      const [, fin, total] = /bytes \d+-(\d+)\/(\d+)/.exec(plage ?? "") ?? [];
      return Number(fin) + 1 === Number(total) ? new Response("{}", { status: 201 }) : Response.json({ nextExpectedRanges: [`${Number(fin) + 1}-`] });
    }
    if (methode === "DELETE") return new Response(null, { status: 204 });
    if (url.endsWith("/send")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 201 });
  });
}

const mail = (x: Record<string, unknown> = {}) => ({
  objet: "S0297 · Les Tilleuls · 3 rue des Lilas - Devis toiture",
  corps: "Bonjour,\nveuillez trouver le devis.",
  a: ["cs@exemple.fr"],
  cc: [],
  ...x,
});
const fichier = (taille: number, nom = "devis.pdf") => new File([new Uint8Array(taille)], nom, { type: "application/pdf" });

function boites(envoi: boolean) {
  vi.stubEnv("MAIL_TRI_BOITES", JSON.stringify([{ boite: SYNDIC4, agences: ["HLS"], ecriture: false, automatique: false, envoi }]));
}

beforeEach(() => {
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
  vi.stubEnv("MAIL_SOURCE", "graph");
  vi.stubEnv("MAIL_ENVOI", "on");
  vi.stubEnv("AUTH_SECRET", "secret-de-test");
  boites(true);
  etat.session = sophie;
  etat.graph = [];
  etat.trancheEnEchec = null;
  etat.rattachements = [];
  etat.incarnation = false;
  reseau();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mail neuf avec un fichier de 10 Mo", () => {
  it("brouillon neuf, fichier déposé en trois tranches, envoi, puis inscription au journal du dossier", async () => {
    const prep = await preparerCompositionAction(mail({ dossierId: "d-42", fichiers: [{ nom: "devis.pdf", taille: 10 * MO }] }));
    expect(prep.ok && prep.donnees).toMatchObject({ simulation: false, envoi: true, boite: SYNDIC4, webLink: "https://outlook/nb1", mails: 1 });
    const jetons = (prep.ok && prep.donnees?.jetons) || [];
    expect(jetons).toHaveLength(1);
    // Le brouillon d'abord, sans pièce jointe ni base64 dans la requête.
    expect(etat.graph).toEqual(["POST /messages"]);

    const progres: number[] = [];
    const d = await deposerFichier(jetons[0]!, fichier(10 * MO), (x) => progres.push(x));
    expect(d).toEqual({ ok: true });
    expect(progres.at(-1)).toBe(1);

    const fin = await finaliserCompositionAction({ jetons });
    expect(fin).toEqual({ ok: true, donnees: { simulation: false, envoye: true, boite: SYNDIC4, rattache: true, mails: 1 } });
    const t = 10 * MO;
    const tr = 12 * 320 * 1024;
    expect(etat.graph).toEqual([
      "POST /messages",
      "POST /messages/nb1/attachments/createUploadSession",
      `PUT https://upload/s1 [bytes 0-${tr - 1}/${t}]`,
      `PUT https://upload/s1 [bytes ${tr}-${2 * tr - 1}/${t}]`,
      `PUT https://upload/s1 [bytes ${2 * tr}-${t - 1}/${t}]`,
      "POST /messages/nb1/send",
    ]);
    // Le journal du dossier pointe le mail par son internetMessageId, qui survit à l'envoi.
    expect(etat.rattachements).toEqual([["d-42", "u1", "SK", `Mail envoyé à cs@exemple.fr : ${mail().objet}`, `echange:${SYNDIC4}|<neuf1@x>`]]);
  });

  it("une tranche refusée par Outlook : le brouillon est supprimé, rien ne part", async () => {
    etat.trancheEnEchec = 1;
    const prep = await preparerCompositionAction(mail({ fichiers: [{ nom: "devis.pdf", taille: 10 * MO }] }));
    const jetons = (prep.ok && prep.donnees?.jetons) || [];
    const d = await deposerFichier(jetons[0]!, fichier(10 * MO), () => undefined);
    expect(d).toEqual({ ok: false, erreur: "Outlook a refusé « devis.pdf ». Réessaie, ou envoie-le depuis Outlook." });
    expect(await abandonnerCompositionAction({ jetons })).toEqual({ ok: true, donnees: null });
    expect(etat.graph.at(-1)).toBe("DELETE /messages/nb1");
    expect(etat.graph.some((l) => l.endsWith("/send"))).toBe(false);
  });

  it("boîte partagée sans envoi ouvert : le brouillon reste dans Outlook, avec ses fichiers", async () => {
    boites(false);
    const prep = await preparerCompositionAction(mail({ fichiers: [{ nom: "petit.pdf", taille: 1000 }] }));
    expect(prep.ok && prep.donnees).toMatchObject({ envoi: false, webLink: "https://outlook/nb1" });
    const jetons = (prep.ok && prep.donnees?.jetons) || [];
    expect(await deposerFichier(jetons[0]!, fichier(1000, "petit.pdf"), () => undefined)).toEqual({ ok: true });
    const fin = await finaliserCompositionAction({ jetons });
    expect(fin.ok && fin.donnees?.envoye).toBe(false);
    expect(etat.graph).toEqual(["POST /messages", "POST /messages/nb1/attachments"]);
  });
});

describe("limites et gardes", () => {
  it("25 Mo par fichier, 25 Mo au total, 10 fichiers : refusé avant tout brouillon", async () => {
    const trop = await preparerCompositionAction(mail({ fichiers: [{ nom: "gros.zip", taille: 26 * MO }] }));
    expect(trop).toEqual({ ok: false, erreur: expect.stringContaining("25 Mo") });
    const total = await preparerCompositionAction(mail({ fichiers: [{ nom: "a.pdf", taille: 15 * MO }, { nom: "b.pdf", taille: 15 * MO }] }));
    expect(total).toEqual({ ok: false, erreur: expect.stringContaining("25 Mo au total") });
    const nombre = await preparerCompositionAction(mail({ fichiers: Array.from({ length: 11 }, (_, i) => ({ nom: `f${i}.pdf`, taille: 10 })) }));
    expect(nombre.ok).toBe(false);
    expect(etat.graph).toEqual([]);
  });

  it("agence sans boîte partagée : la boîte perso, seule proposée (29/10/2026)", async () => {
    etat.session = { ...sophie, id: "u9", email: "marc@real31.fr", agencyId: "ag-ml" };
    const prep = await preparerCompositionAction(mail());
    expect(prep.ok && prep.donnees).toMatchObject({ simulation: false, boite: "marc@real31.fr", envoi: true });
    expect(etat.graph).toEqual([`POST https://graph/users/${encodeURIComponent("marc@real31.fr")}/messages`]);
  });

  it("aucune boîte du tout (incarnation, agence sans boîte) : aperçu seulement, rien n'est écrit", async () => {
    etat.session = { ...sophie, id: "u9", email: "marc@real31.fr", agencyId: "ag-ml" };
    etat.incarnation = true;
    const prep = await preparerCompositionAction(mail());
    expect(prep).toEqual({ ok: true, donnees: { simulation: true, boite: null } });
    expect(etat.graph).toEqual([]);
  });

  it("jeton d'une autre personne : dépôt refusé (410), envoi et suppression refusés", async () => {
    const prep = await preparerCompositionAction(mail());
    const jetons = (prep.ok && prep.donnees?.jetons) || [];
    etat.session = { ...sophie, id: "u2", email: "marc@real31.fr" };
    const d = await deposerFichier(jetons[0]!, fichier(1000), () => undefined);
    expect(d).toEqual({ ok: false, erreur: "L'envoi a expiré (15 minutes) : recommence l'envoi." });
    expect((await finaliserCompositionAction({ jetons })).ok).toBe(false);
    expect((await abandonnerCompositionAction({ jetons })).ok).toBe(false);
    expect(etat.graph).toEqual(["POST /messages"]);
  });

  it("un jeton de réponse ne finalise pas un mail neuf", async () => {
    const reponse = scellerJeton({
      nature: "brouillon",
      boite: SYNDIC4,
      draftId: "br1",
      gid: "u1",
      mode: "envoyer",
      emailId: "<a@x>",
      coproCode: "S0297",
      boiteMessage: SYNDIC4,
      exp: Date.now() + 60_000,
    });
    expect((await finaliserCompositionAction({ jetons: [reponse] })).ok).toBe(false);
    expect(etat.graph).toEqual([]);
  });
});

describe("« De » choisi (29/10/2026) : le serveur ne croit pas le navigateur", () => {
  const SYNDIC2 = "syndic2@real31.fr";
  const elsa = { id: "u5", nomComplet: "Elsa P", initiales: "EP", email: "elsa@real31.fr", agencyId: "ag-lgc", role: "COMPTABLE" };
  const nicolas = { id: "u6", nomComplet: "Nicolas G", initiales: "NG", email: "nicolas@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
  beforeEach(() => {
    vi.stubEnv(
      "MAIL_TRI_BOITES",
      JSON.stringify([
        { boite: SYNDIC2, agences: ["LGC", "ASN"], ecriture: false, automatique: false, envoi: false },
        { boite: SYNDIC4, agences: ["HLS"], ecriture: false, automatique: false, envoi: false },
      ]),
    );
  });

  it("une comptable de La Garenne écrit depuis syndic4 (copro de Houilles) : brouillon dans syndic4", async () => {
    etat.session = elsa;
    const prep = await preparerCompositionAction(mail({ expediteur: SYNDIC4 }));
    expect(prep.ok && prep.donnees).toMatchObject({ simulation: false, boite: SYNDIC4, envoi: false });
    expect(etat.graph).toEqual(["POST /messages"]);
  });

  it("sans « De » : la boîte de son agence, comme avant", async () => {
    etat.session = nicolas;
    const prep = await preparerCompositionAction(mail());
    expect(prep.ok && prep.donnees).toMatchObject({ boite: SYNDIC2 });
  });

  it("un gestionnaire de La Garenne ne peut pas écrire depuis syndic4, ni depuis l'adresse d'un collègue", async () => {
    etat.session = nicolas;
    expect(await preparerCompositionAction(mail({ expediteur: SYNDIC4 }))).toEqual({ ok: false, erreur: "Boîte non autorisée." });
    expect(await preparerCompositionAction(mail({ expediteur: "sophie@real31.fr" }))).toEqual({ ok: false, erreur: "Boîte non autorisée." });
    expect(etat.graph).toEqual([]);
  });

  it("sa boîte perso : le mail part de chez lui (l'envoi direct ne dépend pas de MAIL_ENVOI)", async () => {
    etat.session = nicolas;
    vi.stubEnv("MAIL_ENVOI", "");
    const prep = await preparerCompositionAction(mail({ expediteur: "Nicolas@real31.fr" }));
    expect(prep.ok && prep.donnees).toMatchObject({ simulation: false, boite: "nicolas@real31.fr", envoi: true });
  });

  it("en incarnation, la boîte perso de la personne incarnée est refusée", async () => {
    etat.session = nicolas;
    etat.incarnation = true;
    expect(await preparerCompositionAction(mail({ expediteur: "nicolas@real31.fr" }))).toEqual({ ok: false, erreur: "Boîte non autorisée." });
    expect(etat.graph).toEqual([]);
  });

  it("toute la copropriété depuis la boîte perso : refusé, avec la raison", async () => {
    etat.session = nicolas;
    const r = await preparerCompositionAction(mail({ a: [], cci: ["c1@exemple.fr"], expediteur: "nicolas@real31.fr" }));
    expect(r).toEqual({ ok: false, erreur: expect.stringContaining("boîte partagée") });
    expect(etat.graph).toEqual([]);
  });
});
