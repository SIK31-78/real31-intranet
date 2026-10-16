import { beforeEach, describe, expect, it, vi } from "vitest";

const sortant = {
  envoyer: vi.fn(async () => {}),
  envoyerNeuf: vi.fn(async () => {}),
  citationReponse: vi.fn(async () => ({ citationHtml: "<div>De : Mahaut</div>", sujet: "RE: S0300 - Fuite" })),
};
vi.mock("@/lib/adapters/router", () => ({ getMailOutboundProvider: () => sortant }));

const { envoyerReponseMail } = await import("./envoyer-reponse");

const base = { internetMessageId: "<m1@x>", corps: "Bonjour", a: ["x@y.fr"], cc: [], cci: [] };

describe("répondre depuis une autre boîte (REA-302)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("même boîte : réponse dans le fil", async () => {
    expect(await envoyerReponseMail({ ...base, boiteMessage: "syndic4@real31.fr", boiteEnvoi: "syndic4@real31.fr" })).toEqual({ filConserve: true });
    expect(sortant.citationReponse).not.toHaveBeenCalled();
  });

  it("autre boîte : le message d'origine est cité, l'objet « RE: » repris", async () => {
    const r = await envoyerReponseMail({ ...base, boiteMessage: "syndic4@real31.fr", boiteEnvoi: "mahaut.carton@real31.fr" });
    expect(sortant.citationReponse).toHaveBeenCalledWith({ boite: "syndic4@real31.fr", internetMessageId: "<m1@x>" });
    expect(sortant.envoyerNeuf).toHaveBeenCalledWith(expect.objectContaining({ boite: "mahaut.carton@real31.fr", sujet: "RE: S0300 - Fuite", citationHtml: "<div>De : Mahaut</div>" }));
    expect(r).toEqual({ filConserve: false, historiqueCite: true });
  });

  it("citation impossible : le mail part quand même, sans historique", async () => {
    sortant.citationReponse.mockRejectedValueOnce(new Error("Graph 404"));
    const r = await envoyerReponseMail({ ...base, sujet: "RE: x", boiteMessage: "syndic4@real31.fr", boiteEnvoi: "perso@real31.fr" });
    expect(sortant.envoyerNeuf).toHaveBeenCalledWith(expect.not.objectContaining({ citationHtml: expect.anything() }));
    expect(r).toEqual({ filConserve: false, historiqueCite: false });
  });
});
