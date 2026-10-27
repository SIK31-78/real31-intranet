import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";

// Isolation par agence et par binôme (V2 du tri, 27/10/2026), de bout en bout côté serveur :
// les actions de « E-mails » avec leurs vraies gardes, le journal du tri en mémoire, la
// session et la lecture Graph mockées. Deux boîtes triées : syndic4 (HLS) et syndic2 (LGC,
// ASN). Données inventées.

const etat = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  repo: null as unknown as MockTriRepository,
  lus: [] as { boite: string; id: string }[],
  incarnation: false,
  delegations: [] as Record<string, unknown>[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  incarnationEnCours: async () => etat.incarnation,
  mailModuleActifPour: () => true,
}));
vi.mock("@/lib/adapters/router", async (original) => ({
  ...(await original<typeof import("@/lib/adapters/router")>()),
  getTriRepository: () => etat.repo,
  // Délégations (ADR-041) et collaborateurs : en mémoire, données inventées.
  getDelegationRepository: () => ({
    listerPourBeneficiaire: async (id: string) => etat.delegations.filter((d) => d.aUserId === id),
  }),
  getGestionnaireRepository: () => ({
    findById: async (id: string) => PERSONNES.find((p) => p.id === id) ?? null,
  }),
  // Les « Envoyés » de syndic4 : une réponse dans la conversation de Sophie, une dans celle de Marc.
  getRechercheMail: () => ({
    envoyes: async () => [
      { id: "env-sophie", conversationId: "conv-sophie" },
      { id: "env-marc", conversationId: "conv-marc" },
    ],
    lireCorps: async (p: { boite: string; id: string }) => {
      etat.lus.push({ boite: p.boite, id: p.id });
      return "texte envoyé";
    },
  }),
  getAgenceRepository: () => ({
    listerAgences: async () => [
      { id: "ag-hls", code: "HLS" },
      { id: "ag-lgc", code: "LGC" },
    ],
  }),
}));
vi.mock("@/lib/services/mes-emails/historique-mail", () => ({
  historiqueDuMail: async (boite: string, id: string) => {
    etat.lus.push({ boite, id });
    return "> historique";
  },
}));

const { chargerHistoriqueAction, envoyerABonneCoproAction, lireEnvoyeAction } = await import("@/app/mes-emails/actions");
const { boitesVisibles, mailsParDelegation } = await import("@/lib/services/mes-emails/boites-visibles");

const SYNDIC4 = "syndic4@real31.fr";
const SYNDIC2 = "syndic2@real31.fr";
const sophie = { id: "u1", nomComplet: "Sophie K", initiales: "SK", email: "sophie@real31.fr", agencyId: "ag-hls", role: "GESTIONNAIRE" };
const nadia = { id: "u3", nomComplet: "Nadia L", initiales: "NL", email: "nadia@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
const sekou = { id: "u9", nomComplet: "Sekou KOMA", initiales: "SKO", email: "sekou@real31.fr", agencyId: "ag-hls", role: "ADMIN" };
const emmanuel = { id: "u5", nomComplet: "Emmanuel LOPES", initiales: "EL", email: "emmanuel@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
const fanny = { id: "u6", nomComplet: "Fanny SORIVELLE", initiales: "FS", email: "fanny@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
const PERSONNES = [sophie, nadia, sekou, emmanuel, fanny];

/** Délégation de `de` vers `a` ; par défaut de portefeuille et active sur une période large. */
const deleguer = (de: { id: string }, a: { id: string }, x: Record<string, unknown> = {}) =>
  etat.delegations.push({ id: `d${etat.delegations.length + 1}`, deUserId: de.id, aUserId: a.id, portee: "portefeuille", depuisISO: "2000-01-01", jusquaISO: "2999-12-31", ...x });

const ranger = (boite: string, imid: string, gestionnaire: string, conversationId?: string) =>
  etat.repo.journaliser({
    boite,
    internetMessageId: imid,
    ...(conversationId ? { conversationId } : {}),
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

beforeEach(async () => {
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
  vi.stubEnv(
    "MAIL_TRI_BOITES",
    JSON.stringify([
      { boite: SYNDIC4, agences: ["HLS"], ecriture: false, automatique: false, envoi: false },
      { boite: SYNDIC2, agences: ["LGC", "ASN"], ecriture: false, automatique: false, envoi: false },
    ]),
  );
  etat.repo = new MockTriRepository({ binomes: [], parCopro: {} });
  etat.lus = [];
  etat.incarnation = false;
  etat.delegations = [];
  await ranger(SYNDIC2, "<d-fanny@x>", "fanny@real31.fr");
  await ranger(SYNDIC4, "<a-sophie@x>", "sophie@real31.fr", "conv-sophie");
  await ranger(SYNDIC4, "<b-marc@x>", "marc@real31.fr", "conv-marc");
  await ranger(SYNDIC2, "<c-nadia@x>", "nadia@real31.fr");
});

afterEach(() => vi.unstubAllEnvs());

describe("boîtes visibles par agence", () => {
  it("un gestionnaire HLS ne voit que syndic4, un gestionnaire LGC que syndic2, le super-admin toutes", async () => {
    const partagees = async (g: typeof sophie, superAdmin = false) =>
      (await boitesVisibles(g, { superAdmin })).filter((b) => !b.personnelle).map((b) => b.id);
    expect(await partagees(sophie)).toEqual([SYNDIC4]);
    expect(await partagees(nadia)).toEqual([SYNDIC2]);
    expect(await partagees(sekou, true)).toEqual([SYNDIC4, SYNDIC2]);
  });
});

describe("« Changer de gestionnaire » ne lit jamais la boîte perso (27/10/2026)", () => {
  it("sans incarnation, la personne lit sa propre boîte", async () => {
    etat.session = sophie;
    expect(await chargerHistoriqueAction("<perso@x>", "sophie@real31.fr")).toBe("> historique");
    expect(etat.lus).toEqual([{ boite: "sophie@real31.fr", id: "<perso@x>" }]);
  });

  it("en incarnation, sa boîte perso n'est ni listée ni lisible, même par une action appelée directement", async () => {
    etat.session = sophie;
    etat.incarnation = true;
    expect((await boitesVisibles(sophie, { sansBoitePerso: true })).some((b) => b.personnelle)).toBe(false);
    expect(await chargerHistoriqueAction("<perso@x>", "sophie@real31.fr")).toBeNull();
    expect(await chargerHistoriqueAction("<perso@x>", undefined)).toBeNull();
    expect(etat.lus).toEqual([]);
  });

  it("en incarnation, la boîte partagée du binôme reste lisible", async () => {
    etat.session = sophie;
    etat.incarnation = true;
    expect(await chargerHistoriqueAction("<a-sophie@x>", SYNDIC4)).toBe("> historique");
  });
});

describe("un mail d'un autre binôme est refusé", () => {
  it("lit l'historique d'un mail distribué à mon binôme", async () => {
    etat.session = sophie;
    expect(await chargerHistoriqueAction("<a-sophie@x>", SYNDIC4)).toBe("> historique");
    expect(etat.lus).toEqual([{ boite: SYNDIC4, id: "<a-sophie@x>" }]);
  });

  it("refuse l'identifiant d'un mail d'un autre binôme de la même boîte, sans lire la boîte", async () => {
    etat.session = sophie;
    expect(await chargerHistoriqueAction("<b-marc@x>", SYNDIC4)).toBeNull();
    expect(etat.lus).toEqual([]);
  });

  it("refuse une boîte d'une autre agence, même avec un vrai identifiant de mail", async () => {
    etat.session = sophie;
    expect(await chargerHistoriqueAction("<c-nadia@x>", SYNDIC2)).toBeNull();
    expect(etat.lus).toEqual([]);
  });

  it("« Pas pour moi » refuse un mail d'un autre binôme", async () => {
    etat.session = sophie;
    const r = await envoyerABonneCoproAction("<b-marc@x>", "S0297", SYNDIC4);
    expect(r.ok).toBe(false);
  });

  it("« Envoyés » : lit une réponse de ma conversation, refuse celle d'un autre binôme (REA-422)", async () => {
    etat.session = sophie;
    expect(await lireEnvoyeAction({ boite: SYNDIC4, id: "env-sophie" })).toEqual({ ok: true, donnees: "texte envoyé" });
    const refus = await lireEnvoyeAction({ boite: SYNDIC4, id: "env-marc" });
    expect(refus.ok).toBe(false);
    expect(etat.lus).toEqual([{ boite: SYNDIC4, id: "env-sophie" }]);
  });

  it("le super-admin en est exempté (pilote)", async () => {
    etat.session = sekou;
    expect(await chargerHistoriqueAction("<b-marc@x>", SYNDIC4)).toBe("> historique");
    expect(await chargerHistoriqueAction("<c-nadia@x>", SYNDIC2)).toBe("> historique");
  });
});

describe("délégation de portefeuille : les mails du titulaire dans la boîte partagée (complément d'ADR-041, 27/10/2026)", () => {
  it("sans délégation, Emmanuel ne lit pas un mail du dossier de Fanny", async () => {
    etat.session = emmanuel;
    expect(await chargerHistoriqueAction("<d-fanny@x>", SYNDIC2)).toBeNull();
    expect(etat.lus).toEqual([]);
  });

  it("avec une délégation active, Emmanuel lit un mail du dossier FS, marqué « Pour Fanny S. »", async () => {
    deleguer(fanny, emmanuel);
    etat.session = emmanuel;
    expect(await chargerHistoriqueAction("<d-fanny@x>", SYNDIC2)).toBe("> historique");
    expect([...(await mailsParDelegation(emmanuel, SYNDIC2))]).toEqual([["<d-fanny@x>", "Fanny S."]]);
  });

  it("délégation expirée, clôturée ou d'agence : refusé", async () => {
    etat.session = emmanuel;
    deleguer(fanny, emmanuel, { jusquaISO: "2001-01-01" });
    deleguer(fanny, emmanuel, { clotureeLeISO: "2026-10-01T08:00:00Z" });
    deleguer(fanny, emmanuel, { portee: "agence", agenceCode: "LGC" });
    expect(await chargerHistoriqueAction("<d-fanny@x>", SYNDIC2)).toBeNull();
    expect(etat.lus).toEqual([]);
  });

  it("en incarnation, les délégations de la personne incarnée valent pour la boîte partagée", async () => {
    deleguer(fanny, emmanuel);
    etat.session = emmanuel;
    etat.incarnation = true;
    expect(await chargerHistoriqueAction("<d-fanny@x>", SYNDIC2)).toBe("> historique");
  });

  it("titulaire d'une autre agence : sa boîte partagée s'ajoute, limitée à ses dossiers", async () => {
    deleguer(nadia, sophie);
    etat.session = sophie;
    expect((await boitesVisibles(sophie)).filter((b) => !b.personnelle).map((b) => b.id)).toEqual([SYNDIC4, SYNDIC2]);
    expect(await chargerHistoriqueAction("<c-nadia@x>", SYNDIC2)).toBe("> historique");
    expect(await chargerHistoriqueAction("<d-fanny@x>", SYNDIC2)).toBeNull();
  });
});
