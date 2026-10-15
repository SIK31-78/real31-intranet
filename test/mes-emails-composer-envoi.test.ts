import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Compositeur : envoi réel quand MAIL_ENVOI=on, et conseil syndical ESTALE dans les contacts.
const etat = vi.hoisted(() => ({
  creerBrouillonNeuf: vi.fn(),
  envoyerBrouillon: vi.fn(),
  listerParCopro: vi.fn(),
  donnees: vi.fn(),
}));
vi.mock("@/lib/adapters/router", () => ({
  getMailOutboundProvider: () => ({ creerBrouillonNeuf: etat.creerBrouillonNeuf, envoyerBrouillon: etat.envoyerBrouillon }),
  getContactsCoproProvider: () => ({ listerParCopro: etat.listerParCopro }),
  getReferentielTriProvider: () => ({ charger: async () => ({ copros: [] }) }),
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({ donneesCoproEstale: etat.donnees }));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => null }));
vi.mock("@/lib/services/echanges/rechercher", () => ({ dossiersPourRattacher: async () => [] }));
vi.mock("@/lib/services/dossiers/rattacher-email", () => ({ rattacherEmailAuDossier: async () => true }));

const { creerBrouillonComposition, listerContactsComposition } = await import("@/lib/services/mes-emails/composer-mail");

const g = { id: "g1", initiales: "SK", email: "sk@real31.fr" } as Parameters<typeof creerBrouillonComposition>[1];
const demande = { objet: "S0302 · Le Tournois · 1 rue X - Fuite", corps: "Bonjour", a: ["cs@x.fr"], cc: [] };

beforeEach(() => {
  vi.stubEnv("MAIL_SOURCE", "graph");
  vi.stubEnv("MAIL_BOITE_TRI", "syndic4@real31.fr");
  etat.creerBrouillonNeuf.mockResolvedValue({ id: "AAMk1", internetMessageId: "<m1@x>" });
  etat.envoyerBrouillon.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("creerBrouillonComposition", () => {
  it("envoie le brouillon quand l'envoi est ouvert", async () => {
    vi.stubEnv("MAIL_ENVOI", "on");
    const r = await creerBrouillonComposition(demande, g);
    expect(r.envoye).toBe(true);
    expect(etat.envoyerBrouillon).toHaveBeenCalledWith({ boite: "syndic4@real31.fr", id: "AAMk1" });
  });

  it("toute la copropriété : copie cachée, adressé à la boîte, découpé en lots (REA-305)", async () => {
    vi.stubEnv("MAIL_ENVOI", "on");
    const cci = Array.from({ length: 500 }, (_, i) => `c${i}@x.fr`);
    const r = await creerBrouillonComposition({ ...demande, a: [], cci }, g);
    expect(r.mails).toBe(2);
    expect(etat.creerBrouillonNeuf).toHaveBeenCalledTimes(2);
    const [premier, second] = etat.creerBrouillonNeuf.mock.calls.map((c) => c[0]);
    expect(premier).toMatchObject({ a: ["syndic4@real31.fr"] });
    expect(premier.cci).toHaveLength(450);
    expect(second.cci).toHaveLength(50);
    expect([...premier.cci, ...second.cci]).toEqual(cci);
    expect(etat.envoyerBrouillon).toHaveBeenCalledTimes(2);
  });

  it("s'arrête au brouillon tant que l'envoi est coupé", async () => {
    const r = await creerBrouillonComposition(demande, g);
    expect(r.envoye).toBe(false);
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
    const contacts = await listerContactsComposition("S0302");
    expect(etat.donnees).toHaveBeenCalledWith("S302");
    const cs = contacts.filter((c) => c.qualite === "conseil_syndical").map((c) => c.email.toLowerCase()).sort();
    expect(cs).toEqual(["pres@x.fr", "proprio@x.fr"]);
  });
});
