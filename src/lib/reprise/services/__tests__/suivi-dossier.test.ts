import { beforeEach, describe, expect, it } from "vitest";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import type { RecapPatrimoine } from "../orchestrateur-patrimoine";
import {
  ajouterAnomalie,
  ajouterJournal,
  appliquerRecap,
  creerDossierSuivi,
  listerDossiers,
  majEtape,
} from "../suivi-dossier";

let repo: DossierRepositoryMemoire;
beforeEach(() => {
  repo = new DossierRepositoryMemoire();
});

describe("suivi-dossier", () => {
  it("cree un dossier et refuse un doublon de ref", async () => {
    await creerDossierSuivi(repo, "S0302", "Gabriel Peri");
    await expect(creerDossierSuivi(repo, "S0302", "X")).rejects.toThrow(/deja existant/);
  });

  it("liste les dossiers tries par ref", async () => {
    await creerDossierSuivi(repo, "S0303", "B");
    await creerDossierSuivi(repo, "S0300", "A");
    expect((await listerDossiers(repo)).map((d) => d.ref)).toEqual(["S0300", "S0303"]);
  });

  it("met a jour le statut d'une etape par code", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const d = await majEtape(repo, "S0302", "P3", "fait");
    expect(d.etapes.find((e) => e.code === "P3")!.statut).toBe("fait");
  });

  it("rejette une etape inconnue et un dossier introuvable", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await expect(majEtape(repo, "S0302", "ZZ", "fait")).rejects.toThrow(/Etape inconnue/);
    await expect(majEtape(repo, "S9999", "P3", "fait")).rejects.toThrow(/introuvable/);
  });

  it("ajoute anomalies (sans doublon) et journal", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await ajouterAnomalie(repo, "S0302", "SCI sans K-bis");
    await ajouterAnomalie(repo, "S0302", "SCI sans K-bis");
    const d = await ajouterJournal(repo, "S0302", "2026-07-01", "Import fait");
    expect(d.anomalies).toEqual(["SCI sans K-bis"]);
    expect(d.journal).toHaveLength(1);
  });

  it("reporte les compteurs et anomalies d'un recap", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const recap = {
      lots: { total: 12, parUsage: {} },
      cles: [{ code: "001", libelle: "CG", totalAttendu: 1000, sommeCalculee: 1000, nbLots: 12, ecart: 0 }],
      owners: { total: 8, sci: 1, couples: 2 },
      attributions: { total: 12, lotsOrphelins: 0 },
      fusionsProposees: 1,
      doublonsNonTranchables: 0,
      notes: ["K-bis a fournir"],
      checks: { ok: true, erreurs: [], warnings: [{ code: "OWNER_FUSION_A_VALIDER", niveau: "warning", message: "fusion X" }] },
      pretAProduire: true,
    } as unknown as RecapPatrimoine;

    const d = await appliquerRecap(repo, "S0302", recap);
    expect(d.compteurs.nbLots).toBe(12);
    expect(d.compteurs.nbCoproprietaires).toBe(8);
    expect(d.compteurs.nbAttributions).toBe(12);
    expect(d.compteurs.nbAnomalies).toBe(1); // 0 erreur + 1 warning
    expect(d.anomalies).toEqual(["K-bis a fournir", "fusion X"]);
  });
});
