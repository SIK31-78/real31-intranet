import { beforeEach, describe, expect, it, vi } from "vitest";

// Offres et devis (REA-333) : validations, retrait d'une offre retenue refusé (D13), devis
// retenu protégé, journal par geste.

import { AUTEUR, FausseBaseContrats } from "./fausse-base.test-util";

const etat = vi.hoisted(() => ({ base: null as unknown as { [k: string]: unknown } }));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/adapters/router", () => ({ getContratsCoproRepository: () => etat.base }));

import { ajouterDevis, ajouterOffreAssurance, ajouterOffreGaz, retenirDevis, retirerDevis, retirerOffreAssurance, retirerOffreGaz } from "./offres";

let base: FausseBaseContrats;

beforeEach(() => {
  base = new FausseBaseContrats();
  etat.base = base as unknown as { [k: string]: unknown };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("offres d'assurance", () => {
  it("saisit une offre (franchise nulle permise) et la journalise", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    const o = await ajouterOffreAssurance({ coproCode: "S104", cycleId: c.id, assureur: " Allianz ", prime: 4250, franchise: 0, garanties: "", recueLeISO: "2026-10-01" }, AUTEUR);
    expect(o).toMatchObject({ assureur: "Allianz", prime: 4250, franchise: 0, garanties: null, recueLeISO: "2026-10-01" });
    expect(base.journal[0]).toMatchObject({ type: "offre_creee", sujet: "assurance", cycleId: c.id, details: { fournisseur: "Allianz", montant: 4250 } });
  });

  it("refuse un assureur vide, une prime nulle, une date illisible", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    await expect(ajouterOffreAssurance({ coproCode: "S104", cycleId: c.id, assureur: "  ", prime: 100, franchise: 0 }, AUTEUR)).rejects.toThrow(/assureur/);
    await expect(ajouterOffreAssurance({ coproCode: "S104", cycleId: c.id, assureur: "X", prime: 0, franchise: 0 }, AUTEUR)).rejects.toThrow(/prime/);
    await expect(ajouterOffreAssurance({ coproCode: "S104", cycleId: c.id, assureur: "X", prime: 10, franchise: 0, recueLeISO: "2026-13-40" }, AUTEUR)).rejects.toThrow(/AAAA-MM-JJ/);
    expect(base.offresAssurance).toHaveLength(0);
  });

  it("retire une offre non retenue, refuse l'offre retenue", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    const libre = await base.creerOffreAssurance({ cycleId: c.id, assureur: "A", prime: 1, franchise: 0, garanties: null, recueLeISO: null });
    const retenue = await base.creerOffreAssurance({ cycleId: c.id, assureur: "B", prime: 2, franchise: 0, garanties: null, recueLeISO: null });
    await base.sauverCycle({ ...c, statut: "clos", offreRetenueId: retenue.id });
    await retirerOffreAssurance({ coproCode: "S104", cycleId: c.id, offreId: libre.id }, AUTEUR);
    expect(base.offresAssurance[0].supprimeeLeISO).toBeTruthy();
    await expect(retirerOffreAssurance({ coproCode: "S104", cycleId: c.id, offreId: retenue.id }, AUTEUR)).rejects.toThrow(/retenue/);
    expect(base.offresAssurance[1].supprimeeLeISO).toBeFalsy();
    expect(base.journal.map((e) => e.type)).toEqual(["offre_retiree"]);
  });
});

describe("offres de gaz", () => {
  it("saisit une offre, refuse une durée hors bornes ou un type de prix inconnu", async () => {
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104" });
    const o = await ajouterOffreGaz({ coproCode: "S104", cycleId: c.id, fournisseur: "Engie", typePrix: "fixe", montant: 9000, dureeMois: 36 }, AUTEUR);
    expect(o.dureeMois).toBe(36);
    await expect(ajouterOffreGaz({ coproCode: "S104", cycleId: c.id, fournisseur: "Engie", typePrix: "fixe", montant: 9000, dureeMois: 0 }, AUTEUR)).rejects.toThrow(/mois/);
    await expect(ajouterOffreGaz({ coproCode: "S104", cycleId: c.id, fournisseur: "Engie", typePrix: "fixe", montant: 9000, dureeMois: 121 }, AUTEUR)).rejects.toThrow(/mois/);
    await expect(ajouterOffreGaz({ coproCode: "S104", cycleId: c.id, fournisseur: "Engie", typePrix: "indexe" as "fixe", montant: 9000, dureeMois: 12 }, AUTEUR)).rejects.toThrow(/type de prix/);
  });

  it("refuse le retrait de l'offre retenue, accepte les autres", async () => {
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104" });
    const o = await base.creerOffreGaz({ cycleId: c.id, fournisseur: "Engie", typePrix: "fixe", montant: 9000, dureeMois: 12, recueLeISO: null });
    await base.sauverCycle({ ...c, offreRetenueId: o.id });
    await expect(retirerOffreGaz({ coproCode: "S104", cycleId: c.id, offreId: o.id }, AUTEUR)).rejects.toThrow(/retenue/);
    await base.sauverCycle({ ...c, offreRetenueId: null });
    await retirerOffreGaz({ coproCode: "S104", cycleId: c.id, offreId: o.id }, AUTEUR);
    expect(base.offresGaz[0].supprimeeLeISO).toBeTruthy();
  });
});

describe("devis CTQ", () => {
  it("saisit, retient, protège le devis retenu, puis lève la sélection", async () => {
    base.ajouterContrat("S104");
    const d = await ajouterDevis({ coproCode: "S104", sujet: "ctq_ascenseur", prestataire: "Socotec", montant: 1800 }, AUTEUR);
    await retenirDevis({ coproCode: "S104", sujet: "ctq_ascenseur", devisId: d.id }, AUTEUR);
    expect(base.contrats.get("S104")?.devisRetenu.ctq_ascenseur).toBe(d.id);
    await expect(retirerDevis({ coproCode: "S104", devisId: d.id }, AUTEUR)).rejects.toThrow(/retenu/);
    await expect(retenirDevis({ coproCode: "S104", sujet: "ctq_vmc", devisId: d.id }, AUTEUR)).rejects.toThrow(/concerne/);
    await retenirDevis({ coproCode: "S104", sujet: "ctq_ascenseur", devisId: null }, AUTEUR);
    expect(base.contrats.get("S104")?.devisRetenu.ctq_ascenseur).toBeNull();
    await retirerDevis({ coproCode: "S104", devisId: d.id }, AUTEUR);
    expect(base.devis[0].supprimeeLeISO).toBeTruthy();
    expect(base.journal.map((e) => e.type)).toEqual(["devis_cree", "devis_retenu", "contrat_corrige", "devis_retire"]);
  });

  it("refuse un devis d'une autre copro et un montant nul", async () => {
    const d = await base.creerDevisCtq({ coproCode: "S088", sujet: "ctq_vmc", prestataire: "X", montant: 10, recueLeISO: null });
    await expect(retirerDevis({ coproCode: "S104", devisId: d.id }, AUTEUR)).rejects.toThrow(/introuvable/);
    await expect(ajouterDevis({ coproCode: "S104", sujet: "ctq_vmc", prestataire: "X", montant: -5 }, AUTEUR)).rejects.toThrow(/montant/);
  });
});
