import { beforeEach, describe, expect, it, vi } from "vitest";

const sortant = {
  preparerBrouillonReponse: vi.fn(async () => ({ id: "br1", webLink: "https://outlook/br1" })),
  creerBrouillonNeuf: vi.fn(async (): Promise<{ id?: string; webLink?: string }> => ({ id: "neuf1" })),
  citationReponse: vi.fn(async () => ({ citationHtml: "<div>De : Mahaut</div>", sujet: "RE: S0300 - Fuite" })),
};
vi.mock("@/lib/adapters/router", () => ({ getMailOutboundProvider: () => sortant }));

const { preparerReponseMail } = await import("./envoyer-reponse");

const base = { internetMessageId: "<m1@x>", corps: "Bonjour", a: ["x@y.fr"], cc: [], cci: [] };

describe("répondre depuis une autre boîte (REA-302), préparé en brouillon (REA-421)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("même boîte : brouillon de réponse dans le fil", async () => {
    expect(await preparerReponseMail({ ...base, boiteMessage: "syndic4@real31.fr", boiteEnvoi: "syndic4@real31.fr" })).toEqual({
      boite: "syndic4@real31.fr",
      draftId: "br1",
      webLink: "https://outlook/br1",
      filConserve: true,
    });
    expect(sortant.citationReponse).not.toHaveBeenCalled();
  });

  it("autre boîte : mail neuf dans la boîte d'envoi, le message d'origine cité, l'objet « RE: » repris", async () => {
    const r = await preparerReponseMail({ ...base, boiteMessage: "syndic4@real31.fr", boiteEnvoi: "mahaut.carton@real31.fr" });
    expect(sortant.citationReponse).toHaveBeenCalledWith({ boite: "syndic4@real31.fr", internetMessageId: "<m1@x>" });
    expect(sortant.creerBrouillonNeuf).toHaveBeenCalledWith(
      expect.objectContaining({ boite: "mahaut.carton@real31.fr", sujet: "RE: S0300 - Fuite", citationHtml: "<div>De : Mahaut</div>" }),
    );
    expect(r).toEqual({ boite: "mahaut.carton@real31.fr", draftId: "neuf1", filConserve: false, historiqueCite: true });
  });

  it("citation impossible : le mail se prépare quand même, sans historique", async () => {
    sortant.citationReponse.mockRejectedValueOnce(new Error("Graph 404"));
    const r = await preparerReponseMail({ ...base, sujet: "RE: x", boiteMessage: "syndic4@real31.fr", boiteEnvoi: "perso@real31.fr" });
    expect(sortant.creerBrouillonNeuf).toHaveBeenCalledWith(expect.not.objectContaining({ citationHtml: expect.anything() }));
    expect(r).toEqual({ boite: "perso@real31.fr", draftId: "neuf1", filConserve: false, historiqueCite: false });
  });

  it("Graph ne rend pas l'id du mail neuf : erreur plutôt qu'un envoi impossible plus tard", async () => {
    sortant.creerBrouillonNeuf.mockResolvedValueOnce({});
    await expect(preparerReponseMail({ ...base, boiteMessage: "syndic4@real31.fr", boiteEnvoi: "perso@real31.fr" })).rejects.toThrow(/identifiant/);
  });
});
