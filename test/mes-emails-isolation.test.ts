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
  statuts: [] as { gestionnaireId: string; emailId: string; statut: string }[],
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
      { id: "env-compta", conversationId: "conv-compta" },
    ],
    lireCorps: async (p: { boite: string; id: string }) => {
      etat.lus.push({ boite: p.boite, id: p.id });
      return "texte envoyé";
    },
  }),
  // L'état des mails (statut commun, lu) : en mémoire, les statuts écrits sont relevés.
  getMesEmailsEtatRepository: () => ({
    setStatut: async (s: { gestionnaireId: string; emailId: string; statut: string }) => {
      etat.statuts.push({ gestionnaireId: s.gestionnaireId, emailId: s.emailId, statut: s.statut });
    },
    getStatutsDesMails: async () => [],
    getEtats: async () => [],
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

const { chargerHistoriqueAction, envoyerABonneCoproAction, lireEnvoyeAction, marquerTraiteAction } = await import("@/app/mes-emails/actions");
const { boitesVisibles, mailsParDelegation } = await import("@/lib/services/mes-emails/boites-visibles");
const { compterMailsATraiter } = await import("@/lib/services/mes-emails/compteur-emails");

const SYNDIC4 = "syndic4@real31.fr";
const SYNDIC2 = "syndic2@real31.fr";
const sophie = { id: "u1", nomComplet: "Sophie K", initiales: "SK", email: "sophie@real31.fr", agencyId: "ag-hls", role: "GESTIONNAIRE" };
const nadia = { id: "u3", nomComplet: "Nadia L", initiales: "NL", email: "nadia@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
const sekou = { id: "u9", nomComplet: "Sekou KOMA", initiales: "SKO", email: "sekou@real31.fr", agencyId: "ag-hls", role: "ADMIN" };
const emmanuel = { id: "u5", nomComplet: "Emmanuel LOPES", initiales: "EL", email: "emmanuel@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
const fanny = { id: "u6", nomComplet: "Fanny SORIVELLE", initiales: "FS", email: "fanny@real31.fr", agencyId: "ag-lgc", role: "GESTIONNAIRE" };
// Comptables (role COMPTABLE de la table) : une à LGC, une à HLS. Données inventées.
const elsa = { id: "u7", nomComplet: "Elsa P", initiales: "EP", email: "elsa@real31.fr", agencyId: "ag-lgc", role: "COMPTABLE" };
const ines = { id: "u8", nomComplet: "Inès H", initiales: "IH", email: "ines@real31.fr", agencyId: "ag-hls", role: "COMPTABLE" };
const PERSONNES = [sophie, nadia, sekou, emmanuel, fanny, elsa, ines];

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

/** Un rangement du tri dans le dossier « Comptabilité » de la boîte. */
const rangerCompta = (boite: string, imid: string, conversationId?: string) =>
  etat.repo.journaliser({
    boite,
    internetMessageId: imid,
    ...(conversationId ? { conversationId } : {}),
    messageId: imid,
    expediteur: "fournisseur@exemple.fr",
    objet: "Facture",
    coproReference: null,
    copros: [],
    dossierNom: "Comptabilité",
    dossierCle: "comptabilite",
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
  etat.statuts = [];
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

describe("délégation de portefeuille : la boîte perso du titulaire (option a, 27/10/2026)", () => {
  it("avec la délégation, l'onglet « Boîte de Fanny S. (délégation) » et sa lecture ; sans, refusé", async () => {
    etat.session = emmanuel;
    expect(await chargerHistoriqueAction("<perso-fanny@x>", "fanny@real31.fr")).toBeNull();
    deleguer(fanny, emmanuel);
    expect((await boitesVisibles(emmanuel)).map((b) => b.libelle)).toEqual(["Ma boîte", "syndic2 · mes mails", "Boîte de Fanny S. (délégation)"]);
    expect(await chargerHistoriqueAction("<perso-fanny@x>", "fanny@real31.fr")).toBe("> historique");
    expect(etat.lus).toEqual([{ boite: "fanny@real31.fr", id: "<perso-fanny@x>" }]);
  });

  it("délégation d'agence : pas d'onglet", async () => {
    deleguer(fanny, emmanuel, { portee: "agence", agenceCode: "LGC" });
    expect((await boitesVisibles(emmanuel)).some((b) => b.id === "fanny@real31.fr")).toBe(false);
  });

  it("en incarnation : ni l'onglet ni la lecture, même avec la délégation", async () => {
    deleguer(fanny, emmanuel);
    etat.session = emmanuel;
    etat.incarnation = true;
    expect((await boitesVisibles(emmanuel, { sansBoitePerso: true })).some((b) => b.personnelle)).toBe(false);
    expect(await chargerHistoriqueAction("<perso-fanny@x>", "fanny@real31.fr")).toBeNull();
  });
});

describe("comptables : le dossier « Comptabilité » de toutes les boîtes triées (28/10/2026)", () => {
  beforeEach(async () => {
    await rangerCompta(SYNDIC4, "<f-compta4@x>", "conv-compta");
    await rangerCompta(SYNDIC2, "<g-compta2@x>");
  });

  it("quelle que soit son agence, toutes les boîtes triées, en un seul onglet « Comptabilité »", async () => {
    for (const c of [elsa, ines]) {
      const boites = await boitesVisibles(c);
      expect(boites.map((b) => [b.id, b.libelle, b.onglet?.id ?? null])).toEqual([
        [c.email, "Ma boîte", null],
        [SYNDIC4, "syndic4 · comptabilité", SYNDIC4],
        [SYNDIC2, "syndic2 · comptabilité", SYNDIC4],
      ]);
    }
  });

  it("lit un mail rangé dans « Comptabilité » de chaque boîte, depuis sa boîte d'origine", async () => {
    etat.session = elsa;
    expect(await chargerHistoriqueAction("<f-compta4@x>", SYNDIC4)).toBe("> historique");
    expect(await chargerHistoriqueAction("<g-compta2@x>", SYNDIC2)).toBe("> historique");
    expect(etat.lus).toEqual([
      { boite: SYNDIC4, id: "<f-compta4@x>" },
      { boite: SYNDIC2, id: "<g-compta2@x>" },
    ]);
  });

  it("refuse les mails des binômes, même ceux de sa propre agence, et un mail compta annoncé dans la mauvaise boîte", async () => {
    etat.session = elsa;
    expect(await chargerHistoriqueAction("<c-nadia@x>", SYNDIC2)).toBeNull();
    expect(await chargerHistoriqueAction("<a-sophie@x>", SYNDIC4)).toBeNull();
    expect(await chargerHistoriqueAction("<f-compta4@x>", SYNDIC2)).toBeNull();
    expect(etat.lus).toEqual([]);
  });

  it("un gestionnaire ne voit pas « Comptabilité » (isolement inchangé)", async () => {
    etat.session = sophie;
    expect(await chargerHistoriqueAction("<f-compta4@x>", SYNDIC4)).toBeNull();
    expect((await boitesVisibles(sophie)).some((b) => b.onglet)).toBe(false);
  });

  it("« Marquer traité » : statut commun pour un mail compta, rien d'écrit pour un mail de binôme", async () => {
    etat.session = elsa;
    await marquerTraiteAction("<f-compta4@x>", "", SYNDIC4);
    expect(etat.statuts.map((s) => s.emailId)).toEqual(["<f-compta4@x>", "<f-compta4@x>"]);
    etat.statuts = [];
    await marquerTraiteAction("<a-sophie@x>", "", SYNDIC4);
    expect(etat.statuts).toEqual([]);
  });

  it("« Pas pour moi » refuse un mail de binôme", async () => {
    etat.session = elsa;
    expect((await envoyerABonneCoproAction("<c-nadia@x>", "S0297", SYNDIC2)).ok).toBe(false);
  });

  it("« Envoyés » : les réponses des conversations « Comptabilité », pas celles des binômes", async () => {
    etat.session = ines;
    expect(await lireEnvoyeAction({ boite: SYNDIC4, id: "env-compta" })).toEqual({ ok: true, donnees: "texte envoyé" });
    expect((await lireEnvoyeAction({ boite: SYNDIC4, id: "env-sophie" })).ok).toBe(false);
  });

  it("en incarnation : ni boîte perso ni sa lecture, « Comptabilité » reste lisible", async () => {
    etat.session = elsa;
    etat.incarnation = true;
    expect((await boitesVisibles(elsa, { sansBoitePerso: true })).some((b) => b.personnelle)).toBe(false);
    expect(await chargerHistoriqueAction("<perso@x>", "elsa@real31.fr")).toBeNull();
    expect(await chargerHistoriqueAction("<perso@x>", undefined)).toBeNull();
    expect(await chargerHistoriqueAction("<g-compta2@x>", SYNDIC2)).toBe("> historique");
  });

  it("la pastille compte les mails « Comptabilité » des deux boîtes", async () => {
    expect(await compterMailsATraiter(elsa, { superAdmin: false, incarnation: true })).toBe(2);
    expect(await compterMailsATraiter(sophie, { superAdmin: false, incarnation: true })).toBe(1);
  });
});
