import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposition } from "@/lib/domain/proposition/proposition";

// Les GARDES des Server Actions du module Propositions, exercees depuis l'action elle-meme
// (audit du 16/09/2026 : un gestionnaire pouvait passer une proposition « elue » ; deux
// actions n'avaient pas de session). La session et le routeur sont mockes ; on ne teste
// que le refus / l'acceptation, pas le service.

const etat = vi.hoisted(() => ({
  session: null as { id: string; nomComplet: string; initiales: string; email?: string; role?: string; habilitations?: string[] } | null,
  proposition: null as Proposition | null,
  majAppelee: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getGestionnaireCourant: async () => etat.session }));
vi.mock("@/lib/services/proposition/propositions", () => ({
  getProposition: async () => etat.proposition,
  mettreAJourProposition: async () => {
    etat.majAppelee++;
    return etat.proposition;
  },
  rechercherRegistre: async () => [],
  calculerPrix: async () => ({ annee: 2026, grilleDisponible: false, forfait: { details: [], grilleTtc: 0, grilleHt: 0, timbresTtc: 0 } }),
  marquerOffreRemise: async () => etat.proposition,
  creerProposition: async () => etat.proposition,
  detacherProposition: async () => etat.proposition,
  rattacherProposition: async () => etat.proposition,
}));
vi.mock("@/lib/services/proposition/election", () => ({ elireProposition: async () => ({ coproCode: "S307", etapes: [] }) }));

import { calculerPrixAction, marquerOffreRemiseAction, mettreAJourPropositionAction, rechercherRegistreAction } from "./actions";

const base: Proposition = {
  id: "p1",
  statut: "en_cours",
  agence: "LGC",
  immeuble: { adresse: "16 rue Sébastopol" },
  contact: { nom: "Mme X" },
  prix: {},
  journal: [],
  creeParNom: "Quelqu'un",
  creeLeISO: "2026-09-16",
  majLeISO: "2026-09-16",
};
const gestionnaire = { id: "u1", nomComplet: "Rémi BARD", initiales: "RB", email: "remi@real31.fr", role: "GESTIONNAIRE" };
const directrice = { id: "u2", nomComplet: "Sandy CARRIER", initiales: "SC", email: "sandy@real31.fr", role: "DIRECTEUR_SYNDIC" };
const referentHLS = { id: "u3", nomComplet: "Titouan GAUDIN", initiales: "TG", email: "titouan@real31.fr", role: "GESTIONNAIRE", habilitations: ["referent_syndic:HLS"] };

beforeEach(() => {
  etat.session = gestionnaire;
  etat.proposition = { ...base };
  etat.majAppelee = 0;
  for (const v of ["SUPER_ADMINS", "DIRECTEURS", "MANAGERS"]) vi.stubEnv(v, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("mettreAJourPropositionAction — qui peut clore", () => {
  it("un gestionnaire ne passe pas une proposition « elue »", async () => {
    const r = await mettreAJourPropositionAction({ id: "p1", statut: "elu" });
    expect(r.ok).toBe(false);
    expect(etat.majAppelee).toBe(0);
  });
  it("un gestionnaire ne date pas la remise de l'offre", async () => {
    const r = await mettreAJourPropositionAction({ id: "p1", remisePropositionISO: "2026-09-16" });
    expect(r.ok).toBe(false);
  });
  it("un gestionnaire peut passer d'en cours a reporte, et completer le contact", async () => {
    expect((await mettreAJourPropositionAction({ id: "p1", statut: "reporte" })).ok).toBe(true);
    expect((await mettreAJourPropositionAction({ id: "p1", contact: { nom: "Mme Y" } })).ok).toBe(true);
    expect(etat.majAppelee).toBe(2);
  });
  it("la directrice clot et fixe le prix", async () => {
    etat.session = directrice;
    expect((await mettreAJourPropositionAction({ id: "p1", statut: "refuse_cs" })).ok).toBe(true);
    expect((await mettreAJourPropositionAction({ id: "p1", prix: { honorairesTtc: 4000 } })).ok).toBe(true);
  });
  it("le referent HLS decide sur une proposition HLS, pas sur une proposition LGC", async () => {
    etat.session = referentHLS;
    expect((await mettreAJourPropositionAction({ id: "p1", statut: "elu" })).ok).toBe(false);
    etat.proposition = { ...base, agence: "HLS" };
    expect((await mettreAJourPropositionAction({ id: "p1", statut: "elu" })).ok).toBe(true);
  });
  it("marquer l'offre remise suit l'agence de la proposition", async () => {
    etat.session = referentHLS;
    expect((await marquerOffreRemiseAction({ id: "p1" })).ok).toBe(false);
    etat.proposition = { ...base, agence: "HLS" };
    expect((await marquerOffreRemiseAction({ id: "p1" })).ok).toBe(true);
  });
});

describe("actions sans session", () => {
  it("le registre et le calcul de prix exigent une session", async () => {
    etat.session = null;
    expect((await rechercherRegistreAction("16 rue sebastopol")).ok).toBe(false);
    expect((await calculerPrixAction({ adresse: "x" })).ok).toBe(false);
  });
});
