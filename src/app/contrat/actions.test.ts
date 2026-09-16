import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La garde de « Editer le contrat » (audit du 16/09/2026 : l'action n'avait ni role ni
// cloisonnement, et acceptait un montant negatif). Session, perimetre et service mockes.

const etat = vi.hoisted(() => ({
  session: null as { id: string; nomComplet: string; email?: string; role?: string } | null,
  perimetreRefuse: false,
  editions: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ getGestionnaireCourant: async () => etat.session }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  exigerPerimetre: async () => {
    if (etat.perimetreRefuse) throw new Error("Copropriété hors du périmètre du gestionnaire.");
  },
}));
vi.mock("@/lib/services/contrat/editer-contrat", () => ({
  editerContrat: async () => {
    etat.editions++;
  },
}));

import { editerContratAction } from "./actions";

function formulaire(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}
const gestionnaire = { id: "u1", nomComplet: "Rémi BARD", email: "remi@real31.fr", role: "GESTIONNAIRE" };
const vente = { id: "u9", nomComplet: "Baptiste V", email: "baptiste@real31.fr", role: "AUTRE" };

beforeEach(() => {
  etat.session = gestionnaire;
  etat.perimetreRefuse = false;
  etat.editions = 0;
  for (const v of ["SUPER_ADMINS", "DIRECTEURS", "MANAGERS"]) vi.stubEnv(v, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("editerContratAction", () => {
  it("l'equipe syndic edite une copro de son perimetre, puis part vers le document", async () => {
    await expect(editerContratAction(formulaire({ copro: "S215", honoraires: "4200" }))).rejects.toThrow(
      "REDIRECT /contrat/S215/imprimer?honoraires=4200",
    );
    expect(etat.editions).toBe(1);
  });
  it("hors syndic (vente) : refuse avant toute ecriture", async () => {
    etat.session = vente;
    await expect(editerContratAction(formulaire({ copro: "S215" }))).rejects.toThrow("réservé à l'équipe syndic");
    expect(etat.editions).toBe(0);
  });
  it("hors perimetre : refuse avant toute ecriture", async () => {
    etat.perimetreRefuse = true;
    await expect(editerContratAction(formulaire({ copro: "S215" }))).rejects.toThrow("hors du périmètre");
    expect(etat.editions).toBe(0);
  });
  it("code de copro illisible ou montant negatif : refuse", async () => {
    await expect(editerContratAction(formulaire({ copro: "S215/../x" }))).rejects.toThrow("illisible");
    await expect(editerContratAction(formulaire({ copro: "S215", honoraires: "-5" }))).rejects.toThrow("hors limites");
    expect(etat.editions).toBe(0);
  });
});
