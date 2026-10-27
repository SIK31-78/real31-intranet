import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";

const etat = vi.hoisted(() => ({ repo: null as unknown as MockTriRepository }));

const gens = [
  { id: "1", nomComplet: "Sandy CARRIER", initiales: "SC", email: "sandy@real31.fr" },
  { id: "2", nomComplet: "Galiano GUAETTA", initiales: "GG", email: "galiano@real31.fr" },
  { id: "3", nomComplet: "Julie BOIRON", initiales: "JB", email: "julie@real31.fr", role: "ASSISTANT" },
  { id: "4", nomComplet: "Wilfrid-Huang TOHOUBI", initiales: "WHT", email: "wilfrid@real31.fr", role: "ASSISTANT" },
];

vi.mock("@/lib/adapters/router", () => ({
  getTriRepository: () => etat.repo,
  getGestionnaireRepository: () => ({ listTous: async () => gens, list: async () => gens }),
  getReferentielTriProvider: () => ({
    charger: async () => ({
      copros: [
        { reference: "S0297", nom: "A", adresse: "", gestionnaire: { nomComplet: "Sandy", email: "Sandy@real31.fr" }, assistant: null },
        { reference: "S0305", nom: "B", adresse: "", gestionnaire: { nomComplet: "Océane", email: "oceane@real31.fr" }, assistant: null },
      ],
      expediteurs: {},
    }),
  }),
}));

const { affecterCopro, ajouterAssistant, definirPrincipal, listerCollaborateurs, listerGestionnairesCabinet, retirerAssistant } = await import(
  "@/lib/services/tri-emails/binomes"
);

const principalDe = async () => (await etat.repo.binomes()).binomes.find((b) => b.principal);

describe("binomes du tri", () => {
  beforeEach(() => {
    etat.repo = new MockTriRepository();
  });

  it("pose puis change l'assistant principal sur la meme ligne (le dossier sera renomme)", async () => {
    await definirPrincipal("sandy@real31.fr", "galiano@real31.fr", "sk");
    const avant = await principalDe();
    await definirPrincipal("sandy@real31.fr", "julie@real31.fr", "sk");
    const apres = await principalDe();
    expect(apres?.id).toBe(avant?.id);
    expect(apres?.assistant.email).toBe("julie@real31.fr");
  });

  it("Sandy : Galiano principal, Julie sur S0297", async () => {
    await definirPrincipal("sandy@real31.fr", "galiano@real31.fr", "sk");
    await ajouterAssistant("sandy@real31.fr", "julie@real31.fr", "sk");
    const julie = (await etat.repo.binomes()).binomes.find((b) => b.assistant.email === "julie@real31.fr")!;
    await affecterCopro("S0297", julie.id, "sk", ["HLS"]);
    expect((await etat.repo.binomes()).parCopro).toEqual({ S0297: julie.id });
    await expect(ajouterAssistant("sandy@real31.fr", "julie@real31.fr", "sk")).rejects.toThrow(/déjà assistant/);
  });

  it("promouvoir un autre assistant en principal lui rend ses copros", async () => {
    await definirPrincipal("sandy@real31.fr", "galiano@real31.fr", "sk");
    await ajouterAssistant("sandy@real31.fr", "julie@real31.fr", "sk");
    const julie = (await etat.repo.binomes()).binomes.find((b) => b.assistant.email === "julie@real31.fr")!;
    await affecterCopro("S0297", julie.id, "sk", ["HLS"]);
    await definirPrincipal("sandy@real31.fr", "julie@real31.fr", "sk");
    const b = await etat.repo.binomes();
    expect(b.binomes).toHaveLength(1);
    expect(b.binomes[0]).toMatchObject({ principal: true, assistant: { email: "julie@real31.fr" } });
    expect(b.parCopro).toEqual({});
  });

  it("refuse d'affecter une copro a l'assistant d'un autre gestionnaire", async () => {
    await definirPrincipal("sandy@real31.fr", "galiano@real31.fr", "sk");
    await ajouterAssistant("sandy@real31.fr", "julie@real31.fr", "sk");
    const julie = (await etat.repo.binomes()).binomes.find((b) => b.assistant.email === "julie@real31.fr")!;
    await expect(affecterCopro("S0305", julie.id, "sk", ["HLS"])).rejects.toThrow(/ne travaille pas/);
  });

  it("retirer un assistant rend ses copros au principal", async () => {
    await definirPrincipal("sandy@real31.fr", "galiano@real31.fr", "sk");
    await ajouterAssistant("sandy@real31.fr", "julie@real31.fr", "sk");
    const julie = (await etat.repo.binomes()).binomes.find((b) => b.assistant.email === "julie@real31.fr")!;
    await affecterCopro("S0297", julie.id, "sk", ["HLS"]);
    await retirerAssistant(julie.id);
    expect((await etat.repo.binomes()).parCopro).toEqual({});
  });

  it("la liste des gestionnaires ecarte les assistants ; le choix d'assistant les met en tete", async () => {
    expect((await listerGestionnairesCabinet()).map((g) => g.email)).toEqual(["sandy@real31.fr", "galiano@real31.fr"]);
    expect((await listerCollaborateurs()).slice(0, 2).map((c) => c.role)).toEqual(["ASSISTANT", "ASSISTANT"]);
  });

  it("refuse un gestionnaire assistant de lui-meme", async () => {
    await expect(definirPrincipal("sandy@real31.fr", "Sandy@real31.fr", "sk")).rejects.toThrow(/son propre assistant/);
  });
});
