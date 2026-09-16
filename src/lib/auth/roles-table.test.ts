import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estDirection,
  estEquipeSyndic,
  estHorsSyndic,
  estReferentSyndic,
  peutCompleterProposition,
  peutEditerBareme,
  peutEditerContrat,
  peutElire,
  peutFaireOffre,
  peutOuvrirPerte,
  peutVoirToutesLesPropositions,
} from "./roles";

// Les roles pilotes par public."User".role et les habilitations intranet (16/09/2026).

const directrice = { email: "sandy@real31.fr", roleTable: "DIRECTEUR_SYNDIC" };
const dirigeant = { email: "e@real31.fr", roleTable: "ADMIN" };
const gestionnaire = { email: "remi@real31.fr", roleTable: "GESTIONNAIRE" };
const assistant = { email: "galiano@real31.fr", roleTable: "ASSISTANT" };
const comptable = { email: "elsa@real31.fr", roleTable: "COMPTABLE" };
const vente = { email: "baptiste@real31.fr", roleTable: "AUTRE" };
const referent = { email: "titouan@real31.fr", roleTable: "GESTIONNAIRE", habilitations: ["referent_syndic:HLS"] };

afterEach(() => vi.unstubAllEnvs());

describe("la direction", () => {
  it("= ADMIN, DIRECTEUR_*, referent d'agence, super-admin", () => {
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    expect(estDirection(directrice)).toBe(true);
    expect(estDirection(dirigeant)).toBe(true);
    // Le referent : direction sur SON agence seulement (Sekou, 16/09/2026 : « référent HLS seulement »).
    expect(estDirection(referent, "HLS")).toBe(true);
    expect(estDirection(referent, "LGC")).toBe(false);
    expect(estDirection(referent)).toBe(false);
    expect(estDirection(directrice, "ML")).toBe(true);
    expect(estDirection({ email: "sekou@real31.fr", roleTable: "ADMIN" })).toBe(true);
    expect(estDirection(gestionnaire)).toBe(false);
    expect(estReferentSyndic(referent, "HLS")).toBe(true);
    expect(estReferentSyndic(referent, "ML")).toBe(false);
  });
});

describe("intentions propositions", () => {
  it("seuls les directeurs font des offres, elisent, ouvrent une perte (Sekou, 16/09/2026)", () => {
    for (const p of [directrice, dirigeant]) {
      expect(peutFaireOffre(p)).toBe(true);
      expect(peutElire(p)).toBe(true);
      expect(peutOuvrirPerte(p)).toBe(true);
    }
    expect(peutFaireOffre(referent, "HLS")).toBe(true);
    expect(peutElire(referent, "HLS")).toBe(true);
    expect(peutOuvrirPerte(referent, "LGC")).toBe(false);
    expect(peutElire(referent)).toBe(false);
    for (const p of [gestionnaire, assistant, comptable, vente]) {
      expect(peutFaireOffre(p)).toBe(false);
      expect(peutElire(p)).toBe(false);
      expect(peutOuvrirPerte(p)).toBe(false);
    }
  });
  it("l'equipe syndic complete la fiche ; la compta lit ; hors syndic ne voit que ses contacts", () => {
    expect(peutCompleterProposition(gestionnaire)).toBe(true);
    expect(peutCompleterProposition(assistant)).toBe(true);
    expect(peutCompleterProposition(comptable)).toBe(false);
    expect(peutCompleterProposition(vente)).toBe(false);
    expect(peutVoirToutesLesPropositions(comptable)).toBe(true);
    expect(peutVoirToutesLesPropositions(vente)).toBe(false);
    expect(estHorsSyndic({ email: "x", roleTable: "GESTIONNAIRE_LOCATIVE" })).toBe(true);
    expect(estEquipeSyndic(comptable)).toBe(false);
  });
  it("contrat : equipe syndic et compta ; bareme : super-admin seul", () => {
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    expect(peutEditerContrat(comptable)).toBe(true);
    expect(peutEditerContrat(vente)).toBe(false);
    expect(peutEditerBareme(dirigeant)).toBe(false);
    expect(peutEditerBareme({ email: "sekou@real31.fr" })).toBe(true);
  });
});
