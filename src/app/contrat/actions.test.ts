import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La garde de « Editer le contrat » (audit du 16/09/2026 : l'action n'avait ni role ni
// cloisonnement, et acceptait un montant negatif). Session, perimetre et service mockes.

const etat = vi.hoisted(() => ({
  session: null as { id: string; nomComplet: string; email?: string; role?: string } | null,
  perimetreRefuse: false,
  editions: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
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
  it("l'equipe syndic edite une copro de son perimetre, puis recoit l'adresse du PDF", async () => {
    const res = await editerContratAction({ copro: "S215", honoraires: "4200" });
    expect(res).toEqual({ ok: true, donnees: { pdf: "/contrat/S215/contrat.pdf?honoraires=4200", apercu: "/contrat/S215/imprimer?honoraires=4200" } });
    expect(etat.editions).toBe(1);
  });
  it("au reel, le forfait timbres ne part pas dans l'adresse", async () => {
    const res = await editerContratAction({ copro: "S215", timbres: "792", frais: "reels" });
    expect(res.ok && res.donnees?.pdf).toBe("/contrat/S215/contrat.pdf?timbres=0&frais=reels");
  });
  it("hors syndic (vente) : refuse avant toute ecriture", async () => {
    etat.session = vente;
    const res = await editerContratAction({ copro: "S215" });
    expect(!res.ok && res.erreur).toContain("réservé à l'équipe syndic");
    expect(etat.editions).toBe(0);
  });
  it("hors perimetre : refuse avant toute ecriture", async () => {
    etat.perimetreRefuse = true;
    const res = await editerContratAction({ copro: "S215" });
    expect(!res.ok && res.erreur).toContain("hors du périmètre");
    expect(etat.editions).toBe(0);
  });
  it("code de copro illisible ou montant negatif : refuse", async () => {
    const a = await editerContratAction({ copro: "S215/../x" });
    expect(!a.ok && a.erreur).toContain("illisible");
    const b = await editerContratAction({ copro: "S215", honoraires: "-5" });
    expect(!b.ok && b.erreur).toContain("hors limites");
    expect(etat.editions).toBe(0);
  });
});
