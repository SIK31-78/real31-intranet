import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Compositeur : envoi réel quand MAIL_ENVOI=on, et conseil syndical ESTALE dans les contacts.
// Le mail neuf part en trois temps depuis le 27/10/2026 (préparer, déposer, finaliser).
const etat = vi.hoisted(() => ({
  creerBrouillonNeuf: vi.fn(),
  envoyerBrouillon: vi.fn(),
  supprimerBrouillon: vi.fn(),
  listerParCopro: vi.fn(),
  donnees: vi.fn(),
}));
vi.mock("@/lib/adapters/router", () => ({
  getMailOutboundProvider: () => ({
    creerBrouillonNeuf: etat.creerBrouillonNeuf,
    envoyerBrouillon: etat.envoyerBrouillon,
    supprimerBrouillon: etat.supprimerBrouillon,
  }),
  getContactsCoproProvider: () => ({ listerParCopro: etat.listerParCopro }),
  // Copro hors ESTALE (REA-356) : l'annuaire Crypto reste la source des copropriétaires.
  getCoproprietairesEstaleProvider: () => ({ listerJoignables: async () => null }),
  getCoproRepository: () => ({ findByCode: async () => null }),
  getReferentielTriProvider: () => ({ charger: async () => ({ copros: [] }) }),
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({ donneesCoproEstale: etat.donnees }));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => null }));
vi.mock("@/lib/services/echanges/rechercher", () => ({ dossiersPourRattacher: async () => [] }));
vi.mock("@/lib/services/dossiers/rattacher-email", () => ({ rattacherEmailAuDossier: async () => true }));

const { preparerComposition, finaliserComposition, listerContactsComposition } = await import("@/lib/services/mes-emails/composer-mail");

const g = { id: "g1", initiales: "SK", email: "sk@real31.fr" } as Parameters<typeof preparerComposition>[1];
/** Préparer puis finaliser, sans fichier : l'ancien geste en un appel. */
async function composer(d: Parameters<typeof preparerComposition>[0], config: Parameters<typeof preparerComposition>[2]) {
  const p = await preparerComposition(d, g, config);
  return finaliserComposition(p.jetons ?? [], g);
}
// La boîte de l'agence de la personne (config du tri, 27/10/2026).
const boite = { boite: "syndic4@real31.fr", agences: ["HLS"], depuis: null, ecriture: true, automatique: false, envoi: true };
const demande = { objet: "S0302 · Le Tournois · 1 rue X - Fuite", corps: "Bonjour", a: ["cs@x.fr"], cc: [] };

beforeEach(() => {
  vi.stubEnv("MAIL_SOURCE", "graph");
  vi.stubEnv("MAIL_BOITE_TRI", "syndic4@real31.fr");
  vi.stubEnv("AUTH_SECRET", "secret-de-test");
  etat.creerBrouillonNeuf.mockResolvedValue({ id: "AAMk1", internetMessageId: "<m1@x>" });
  etat.envoyerBrouillon.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("preparerComposition puis finaliserComposition", () => {
  it("envoie le brouillon quand l'envoi est ouvert", async () => {
    vi.stubEnv("MAIL_ENVOI", "on");
    const r = await composer(demande, boite);
    expect(r?.envoye).toBe(true);
    expect(etat.envoyerBrouillon).toHaveBeenCalledWith({ boite: "syndic4@real31.fr", id: "AAMk1" });
  });

  it("toute la copropriété : copie cachée, adressé à la boîte, découpé en lots (REA-305)", async () => {
    vi.stubEnv("MAIL_ENVOI", "on");
    const cci = Array.from({ length: 500 }, (_, i) => `c${i}@x.fr`);
    const r = await composer({ ...demande, a: [], cci }, boite);
    expect(r?.mails).toBe(2);
    expect(etat.creerBrouillonNeuf).toHaveBeenCalledTimes(2);
    const [premier, second] = etat.creerBrouillonNeuf.mock.calls.map((c) => c[0]);
    expect(premier).toMatchObject({ a: ["syndic4@real31.fr"] });
    expect(premier.cci).toHaveLength(450);
    expect(second.cci).toHaveLength(50);
    expect([...premier.cci, ...second.cci]).toEqual(cci);
    expect(etat.envoyerBrouillon).toHaveBeenCalledTimes(2);
  });

  it("s'arrête au brouillon tant que l'envoi est coupé", async () => {
    const r = await composer(demande, boite);
    expect(r?.envoye).toBe(false);
    expect(etat.envoyerBrouillon).not.toHaveBeenCalled();
  });

  it("préparer n'envoie rien : le mode décidé est scellé dans le jeton", async () => {
    vi.stubEnv("MAIL_ENVOI", "on");
    const p = await preparerComposition(demande, g, boite);
    expect(p).toMatchObject({ simulation: false, envoi: true, mails: 1 });
    expect(p.jetons).toHaveLength(1);
    expect(etat.envoyerBrouillon).not.toHaveBeenCalled();
    // L'envoi coupé entre-temps ne change rien : la garde a été passée à la préparation.
    vi.stubEnv("MAIL_ENVOI", "off");
    expect((await finaliserComposition(p.jetons ?? [], g))?.envoye).toBe(true);
  });

  it("un lot refusé par Outlook : les brouillons déjà créés sont supprimés", async () => {
    etat.creerBrouillonNeuf.mockResolvedValueOnce({ id: "AAMk1" }).mockRejectedValueOnce(new Error("Graph 500"));
    const cci = Array.from({ length: 500 }, (_, i) => `c${i}@x.fr`);
    await expect(preparerComposition({ ...demande, a: [], cci }, g, boite)).rejects.toThrow("Graph 500");
    expect(etat.supprimerBrouillon).toHaveBeenCalledWith({ boite: "syndic4@real31.fr", id: "AAMk1" });
  });

  it("sans boîte branchée : aperçu, aucun brouillon ni jeton", async () => {
    const p = await preparerComposition(demande, g, null);
    expect(p).toEqual({ simulation: true, boite: null });
    expect(etat.creerBrouillonNeuf).not.toHaveBeenCalled();
  });

  it("jetons d'une autre personne, ou d'un lot manquant : rien ne part", async () => {
    vi.stubEnv("MAIL_ENVOI", "on");
    const cci = Array.from({ length: 500 }, (_, i) => `c${i}@x.fr`);
    const p = await preparerComposition({ ...demande, a: [], cci }, g, boite);
    expect(await finaliserComposition(p.jetons ?? [], { ...g, id: "g2" })).toBeNull();
    expect(await finaliserComposition((p.jetons ?? []).slice(0, 1), g)).toBeNull();
    expect(etat.envoyerBrouillon).not.toHaveBeenCalled();
  });
});

describe("listerContactsComposition", () => {
  it("ajoute le conseil syndical ESTALE à l'annuaire Crypto", async () => {
    etat.listerParCopro.mockResolvedValue([{ email: "Proprio@x.fr", nom: "Proprio", qualite: "coproprietaire" }]);
    etat.donnees.mockResolvedValue({
      conseilSyndical: [
        { nomComplet: "Mme Présidente", role: "president", email: "pres@x.fr" },
        { nomComplet: "M. Proprio", role: "membre", email: "proprio@x.fr" },
        { nomComplet: "Sans adresse", role: "membre" },
      ],
    });
    const { contacts } = await listerContactsComposition("S0302");
    expect(etat.donnees).toHaveBeenCalledWith("S302");
    const cs = contacts.filter((c) => c.qualite === "conseil_syndical").map((c) => c.email.toLowerCase()).sort();
    expect(cs).toEqual(["pres@x.fr", "proprio@x.fr"]);
  });
});
