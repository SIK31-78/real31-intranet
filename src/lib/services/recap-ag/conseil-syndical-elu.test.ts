import { beforeEach, describe, expect, it, vi } from "vitest";

// Le bloc « Conseil syndical élu » du récap d'AG : l'état de la liste de diffusion (celui de
// la fiche copro) plus les membres ESTALE, en lecture. Données inventées.

const etat = vi.hoisted(() => ({
  hors: false,
  estale: null as null | { conseilSyndical: { nomComplet: string; role: "president" | "membre"; email?: string }[] },
  panneEstale: false,
}));

vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  async exigerPerimetre() {
    if (etat.hors) throw new Error("Copropriété hors du périmètre du gestionnaire.");
  },
}));
vi.mock("@/lib/services/coproprietes/etat-liste-secours-cs", () => ({
  async etatListeSecoursCS() {
    return {
      sourceActive: "crypto",
      estaleFournitEmails: false,
      emailsActifs: ["membre@exemple.test"],
      destinatairesActifs: [{ email: "membre@exemple.test" }],
      emailsSecours: ["membre@exemple.test"],
    };
  },
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  async donneesCoproEstale() {
    if (etat.panneEstale) throw new Error("ESTALE HTTP 503");
    return etat.estale;
  },
}));

const { conseilSyndicalElu } = await import("./conseil-syndical-elu");

beforeEach(() => {
  etat.hors = false;
  etat.estale = null;
  etat.panneEstale = false;
});

describe("conseilSyndicalElu", () => {
  it("copro hors ESTALE : la liste de diffusion seule, aucun membre ESTALE", async () => {
    const r = await conseilSyndicalElu("S901", "m1");
    expect(r.emailsSecours).toEqual(["membre@exemple.test"]);
    expect(r.membresEstale).toEqual([]);
  });

  it("copro ESTALE : les membres, avec ou sans adresse", async () => {
    etat.estale = {
      conseilSyndical: [
        { nomComplet: "Mme PRÉSIDENTE", role: "president", email: " pres@exemple.test " },
        { nomComplet: "M. SANSMAIL", role: "membre" },
      ],
    };
    const r = await conseilSyndicalElu("S901", "m1");
    expect(r.membresEstale).toEqual([
      { nom: "Mme PRÉSIDENTE", role: "president", email: "pres@exemple.test" },
      { nom: "M. SANSMAIL", role: "membre" },
    ]);
  });

  it("ESTALE en panne : pas de membres, pas d'erreur", async () => {
    etat.panneEstale = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await conseilSyndicalElu("S901", "m1")).membresEstale).toEqual([]);
    warn.mockRestore();
  });

  it("copro hors du périmètre : refus", async () => {
    etat.hors = true;
    await expect(conseilSyndicalElu("S901", "m1")).rejects.toThrow(/périmètre/);
  });
});
