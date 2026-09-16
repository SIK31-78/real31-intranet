import { describe, expect, it } from "vitest";
import { coproDepuisElection, nomUsuelPropose, obstaclesElection, prochainCodeCopro } from "./election";
import { INCLUS_OFFRE } from "./offre";
import type { Proposition } from "./proposition";

const p: Proposition = {
  id: "p1",
  statut: "accepte_cs",
  agence: "LGC",
  immeuble: { adresse: "16, rue Sébastopol", codePostal: "92400", commune: "Courbevoie", immatriculation: "AB0175828", lotsPrincipaux: 8, lotsStationnement: 4 },
  contact: { nom: "Mme BOURCHTOFF", email: "l@x.fr" },
  prix: { honorairesTtc: 4944, fraisPostauxReels: true },
  agPrevueISO: "2026-11-20",
  journal: [],
  creeParNom: "test",
  creeLeISO: "2026-09-16",
  majLeISO: "2026-09-16",
};

describe("prochainCodeCopro", () => {
  it("prend le plus grand S + 1 toutes sources confondues, en ignorant les codes de test", () => {
    expect(prochainCodeCopro(["S302", "S0306", "SE999", "T999", "SV10", "S299"])).toBe("S307");
    expect(prochainCodeCopro([])).toBe("S001");
  });
});

describe("nomUsuelPropose", () => {
  it("voie + numero, en capitales sans accent", () => {
    expect(nomUsuelPropose(p)).toBe("SEBASTOPOL16");
    expect(nomUsuelPropose({ ...p, immeuble: { adresse: "2/4/4 bis avenue Rhin et Danube - Courbevoie" } })).toBe("DANUBE2-4-4BIS");
    expect(nomUsuelPropose({ ...p, immeuble: { adresse: "62, rue Jean Bonal - LGC" } })).toBe("BONAL62");
  });
});

describe("obstaclesElection", () => {
  it("code, unicite, nom, date, lots, prix, commune", () => {
    expect(obstaclesElection(p, { code: "S303", nomUsuel: "SEBASTOPOL16", debutISO: "2027-01-01" }, ["S302"])).toEqual([]);
    expect(obstaclesElection(p, { code: "S302", nomUsuel: "", debutISO: "" }, ["S302"])).toEqual([
      "le code S302 existe déjà",
      "le nom court de la copropriété",
      "la date de prise en gestion",
    ]);
    expect(obstaclesElection(p, { code: "303", nomUsuel: "x", debutISO: "2027-01-01" }, [])).toEqual(["le code doit être S suivi de trois chiffres (S303)"]);
  });
});

describe("coproDepuisElection", () => {
  it("assemble la fiche App A depuis la proposition et les choix", () => {
    const c = coproDepuisElection(p, { code: "s303", nomUsuel: "SEBASTOPOL16", debutISO: "2027-01-01", dureeMois: 12, agenceId: "ag-lgc", managerId: "u1", creerClientPennylane: true, ouvrirDossierReprise: true }, INCLUS_OFFRE);
    expect(c).toMatchObject({
      code: "S303",
      nom: "SEBASTOPOL16",
      adresse1: "16, rue Sébastopol",
      codePostal: "92400",
      ville: "Courbevoie",
      immatriculation: "AB0175828",
      lotsPrincipaux: 8,
      lotsAutres: 4,
      agenceId: "ag-lgc",
      managerId: "u1",
      priseEnGestionISO: "2027-01-01",
      finMandatISO: "2027-12-31",
      dureeAgHeures: 2,
      nbCs: 1,
      nbVisites: 1,
      fraisPostauxReels: true,
      nomSdc: "SDC 16, rue Sébastopol - S303",
    });
    expect(c.prochaineAgISO).toBeUndefined(); // l'AG qui a elu est passee au debut du contrat
  });
});
