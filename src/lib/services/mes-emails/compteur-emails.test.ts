import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La pastille « E-mails » (27/10/2026) avec ses dépendances simulées : boîtes visibles,
// distribution, lu d'Outlook de la boîte perso, états en base. Données inventées.

const etat = vi.hoisted(() => ({
  appelsBoites: [] as { sansBoitePerso?: boolean }[],
  appelsLu: [] as string[],
  delaiLu: 0,
}));

vi.mock("./boites-visibles", () => ({
  boitesVisibles: async (_g: unknown, opts: { sansBoitePerso?: boolean }) => {
    etat.appelsBoites.push(opts);
    return [
      ...(opts.sansBoitePerso ? [] : [{ id: "moi@real31.fr", adresse: "moi@real31.fr", libelle: "Ma boîte", personnelle: true }]),
      { id: "syndic2@real31.fr", adresse: "syndic2@real31.fr", libelle: "syndic2 · mes mails", personnelle: false },
    ];
  },
  distributionDe: async () =>
    new Map([
      ["<p1>", "S0297"],
      ["<p2>", "S0297"],
      ["<p3>", null],
    ]),
}));
vi.mock("./lire-boites", () => ({ MAX_PERSO: 40, MAX_PARTAGEE: 80 }));
vi.mock("@/lib/adapters/router", () => ({
  getMailboxProvider: () => ({
    lireEtatsLu: async (p: { boite: string }) => {
      etat.appelsLu.push(p.boite);
      if (etat.delaiLu) await new Promise((r) => setTimeout(r, etat.delaiLu));
      return new Map([
        ["<m1>", false],
        ["<m2>", true],
        ["<m3>", false],
      ]);
    },
  }),
  getMesEmailsEtatRepository: () => ({
    // <p1> marqué traité pour la boîte (statut commun) ; <p2> ouvert dans l'intranet par moi.
    getStatutsDesMails: async () => [{ emailId: "<p1>", gestionnaireId: "boite:syndic2@real31.fr", statut: "classe", etapesFaites: [] }],
    getEtats: async () => [{ emailId: "<p2>", lu: true }],
  }),
}));

const { compterMailsATraiter, oublierCompteurEmails } = await import("./compteur-emails");

const moi = { id: "u-moi", email: "moi@real31.fr", agencyId: "ag-lgc" };
const opts = { superAdmin: false, incarnation: false };

beforeEach(() => {
  etat.appelsBoites = [];
  etat.appelsLu = [];
  etat.delaiLu = 0;
  oublierCompteurEmails(moi.id);
});
afterEach(() => vi.useRealTimers());

describe("compterMailsATraiter", () => {
  it("additionne la boîte perso (non lus Outlook) et la partagée (distribués - traités - ouverts)", async () => {
    // Perso : <m1>, <m3> ; partagée : <p3> seulement.
    expect(await compterMailsATraiter(moi, opts)).toBe(3);
    expect(etat.appelsLu).toEqual(["moi@real31.fr"]);
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
    etat.delaiLu = 5_000;
    vi.useFakeTimers();
    const p = compterMailsATraiter(moi, opts);
    await vi.advanceTimersByTimeAsync(1_600);
    expect(await p).toBeNull();
  });

  it("en incarnation : aucune boîte perso n'est lue, la partagée compte", async () => {
    expect(await compterMailsATraiter(moi, { superAdmin: false, incarnation: true })).toBe(1);
    expect(etat.appelsBoites.at(-1)).toMatchObject({ sansBoitePerso: true });
    expect(etat.appelsLu).toEqual([]);
  });
});
