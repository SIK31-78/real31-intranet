import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La pastille « E-mails » : le chiffre unique « À traiter » (29/10/2026), avec ses dépendances
// simulées : boîtes visibles, distribution datée, statuts en base. Données inventées.

const etat = vi.hoisted(() => ({
  appelsBoites: [] as { sansBoitePerso?: boolean }[],
  appelsStatuts: 0,
  delai: 0,
}));

vi.mock("./boites-visibles", () => ({
  boitesVisibles: async (_g: unknown, opts: { sansBoitePerso?: boolean }) => {
    etat.appelsBoites.push(opts);
    return [
      ...(opts.sansBoitePerso ? [] : [{ id: "moi@real31.fr", adresse: "moi@real31.fr", libelle: "Ma boîte", personnelle: true }]),
      { id: "syndic2@real31.fr", adresse: "syndic2@real31.fr", libelle: "syndic2 · mes mails", personnelle: false },
    ];
  },
  // 90 mails distribués : plus que les 80 que l'écran lisait avant le 29/10/2026.
  distributionDatee: async () =>
    new Map([
      ["<p1>", new Date().toISOString()],
      ["<p2>", new Date().toISOString()],
      ["<vieux>", "2026-01-05T08:00:00Z"],
      ...Array.from({ length: 87 }, (_, i) => [`<x${i}>`, new Date().toISOString()] as [string, string]),
    ]),
}));
vi.mock("@/lib/adapters/router", () => ({
  getMesEmailsEtatRepository: () => ({
    getStatutsDesMails: async () => {
      etat.appelsStatuts++;
      if (etat.delai) await new Promise((r) => setTimeout(r, etat.delai));
      // <p1> marqué traité aujourd'hui pour la boîte (statut commun) ; <p2> répondu, reste à traiter.
      return [
        { emailId: "<p1>", gestionnaireId: "boite:syndic2@real31.fr", statut: "classe", etapesFaites: [], marqueAt: new Date().toISOString() },
        { emailId: "<p2>", gestionnaireId: "u-moi", statut: "repondu", etapesFaites: [] },
      ];
    },
  }),
}));

const { compterMailsATraiter, oublierCompteurEmails } = await import("./compteur-emails");

const moi = { id: "u-moi", email: "moi@real31.fr", agencyId: "ag-lgc" };
const opts = { superAdmin: false, incarnation: false };

beforeEach(() => {
  etat.appelsBoites = [];
  etat.appelsStatuts = 0;
  etat.delai = 0;
  oublierCompteurEmails(moi.id);
});
afterEach(() => vi.useRealTimers());

describe("compterMailsATraiter", () => {
  it("la boîte de travail seulement, sans plafond, lus ou non ; le vieux mail est en retard", async () => {
    expect(await compterMailsATraiter(moi, opts)).toEqual({ principal: 89, enRetard: 1, aRepartir: 0, traitesAujourdhui: 1 });
  });

  it("garde le compte une minute, puis relit ; oublierCompteurEmails le relit tout de suite", async () => {
    await compterMailsATraiter(moi, opts);
    await compterMailsATraiter(moi, opts);
    expect(etat.appelsBoites).toHaveLength(1);
    oublierCompteurEmails(moi.id);
    await compterMailsATraiter(moi, opts);
    expect(etat.appelsBoites).toHaveLength(2);
  });

  it("au-delà de 1,5 s : null (pas de pastille), sans attendre", async () => {
    etat.delai = 5_000;
    vi.useFakeTimers();
    const p = compterMailsATraiter(moi, opts);
    await vi.advanceTimersByTimeAsync(1_600);
    expect(await p).toBeNull();
  });

  it("l'état d'équipe et le mode attribution donnent le chiffre personnel", async () => {
    const r = await compterMailsATraiter(moi, {
      ...opts,
      mode: { type: "attribution", moi: "u-moi" },
      etatEquipe: async (_b, ids) =>
        new Map(ids.map((id) => [id, id === "<p2>" ? { attribueA: "u-moi" } : id === "<vieux>" ? { attribueA: null } : { attribueA: "u-autre" }])),
    });
    expect(r).toMatchObject({ principal: 1, enRetard: 0, aRepartir: 1 });
  });

  it("en incarnation : la boîte partagée compte de même", async () => {
    expect((await compterMailsATraiter(moi, { superAdmin: false, incarnation: true }))?.principal).toBe(89);
    expect(etat.appelsBoites.at(-1)).toMatchObject({ sansBoitePerso: true });
  });
});

describe("compterMailsATraiter : état d'équipe", () => {
  it("tables absentes (lecture null) : chiffre provisoire du binôme, sans erreur", async () => {
    const r = await compterMailsATraiter(moi, { ...opts, mode: { type: "attribution", moi: "moi@real31.fr" }, etatEquipe: async () => null, relances: async () => null });
    expect(r).toMatchObject({ principal: 89, aRepartir: 0 });
  });

  it("une relance due posée par moi entre dans mon chiffre ; un mail de côté en sort", async () => {
    const r = await compterMailsATraiter(moi, {
      ...opts,
      mode: { type: "attribution", moi: "moi@real31.fr" },
      etatEquipe: async (_b, ids) =>
        new Map(ids.map((id) => [id, id === "<p2>" ? { attribueA: "moi@real31.fr" } : id === "<vieux>" ? { attribueA: "moi@real31.fr", horsChiffre: true } : { attribueA: "autre@real31.fr" }])),
      relances: async () => [{ etat: { attribueA: "moi@real31.fr" }, retard: false }],
    });
    expect(r).toMatchObject({ principal: 2, enRetard: 0, aRepartir: 0 });
  });
});
