import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Qui touche un dossier de perte (audit du 16/09/2026 : tout le cabinet pouvait modifier
// n'importe quel dossier). La direction de l'agence passe ; les autres restent dans leur
// portefeuille. Session, perimetre, agence et service mockes.

const etat = vi.hoisted(() => ({
  session: null as { id: string; nomComplet: string; email?: string; role?: string; habilitations?: string[] } | null,
  agence: "LGC",
  perimetreRefuse: false,
  majs: 0,
  ouvertures: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getGestionnaireCourant: async () => etat.session }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  exigerPerimetre: async () => {
    if (etat.perimetreRefuse) throw new Error("Copropriété hors du périmètre du gestionnaire.");
  },
}));
vi.mock("@/lib/services/agences/resoudre-agence", () => ({ agenceDeCopro: async () => etat.agence }));
vi.mock("@/lib/services/perte/dossier-perte", () => ({
  getDossierPerte: async () => ({ id: "d1", coproCode: "S182" }),
  mettreAJourEtapePerte: async () => {
    etat.majs++;
  },
  ouvrirDossierPerte: async () => {
    etat.ouvertures++;
    return { id: "d1" };
  },
}));

import { mettreAJourEtapeAction, ouvrirDossierAction } from "./actions";

const gestionnaire = { id: "u1", nomComplet: "Rémi BARD", email: "remi@real31.fr", role: "GESTIONNAIRE" };
const referentHLS = {
  id: "u3",
  nomComplet: "Titouan GAUDIN",
  email: "titouan@real31.fr",
  role: "GESTIONNAIRE",
  habilitations: ["referent_syndic:HLS"],
};
const etape = { dossierId: "d1", code: "AG1", statut: "fait" as const };
const ouverture = { coproCode: "S182", dateAgISO: "2026-09-30", finGestionISO: "2026-12-31", confirmation: "S182" };

beforeEach(() => {
  etat.session = gestionnaire;
  etat.agence = "LGC";
  etat.perimetreRefuse = false;
  etat.majs = 0;
  etat.ouvertures = 0;
  for (const v of ["SUPER_ADMINS", "DIRECTEURS", "MANAGERS"]) vi.stubEnv(v, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("mettreAJourEtapeAction", () => {
  it("un gestionnaire coche une etape d'un dossier de son portefeuille", async () => {
    expect((await mettreAJourEtapeAction(etape)).ok).toBe(true);
    expect(etat.majs).toBe(1);
  });
  it("hors portefeuille : refus, rien n'est ecrit", async () => {
    etat.perimetreRefuse = true;
    const r = await mettreAJourEtapeAction(etape);
    expect(r).toEqual({ ok: false, erreur: "Copropriété hors du périmètre du gestionnaire." });
    expect(etat.majs).toBe(0);
  });
  it("le referent HLS passe sur une copro HLS meme hors portefeuille, pas sur une copro LGC", async () => {
    etat.session = referentHLS;
    etat.perimetreRefuse = true;
    expect((await mettreAJourEtapeAction(etape)).ok).toBe(false);
    etat.agence = "HLS";
    expect((await mettreAJourEtapeAction(etape)).ok).toBe(true);
  });
});

describe("ouvrirDossierAction", () => {
  it("un gestionnaire n'ouvre pas de perte ; le referent HLS oui, sur HLS seulement", async () => {
    expect((await ouvrirDossierAction(ouverture)).ok).toBe(false);
    etat.session = referentHLS;
    expect((await ouvrirDossierAction(ouverture)).ok).toBe(false);
    etat.agence = "HLS";
    expect((await ouvrirDossierAction(ouverture)).ok).toBe(true);
    expect(etat.ouvertures).toBe(1);
  });
});
