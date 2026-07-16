import { beforeEach, describe, expect, it } from "vitest";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import type { RecapPatrimoine } from "../orchestrateur-patrimoine";
import {
  ajouterAnomalie,
  ajouterJournal,
  appliquerRecap,
  corrigerJeuDossier,
  creerDossierSuivi,
  enregistrerJeu,
  listerDossiers,
  majEtape,
  obtenirDossier,
} from "../suivi-dossier";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

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
    const d = await majEtape(repo, "S0302", "R3", "fait");
    expect(d.etapes.find((e) => e.code === "R3")!.statut).toBe("fait");
  });

  it("rejette une etape inconnue et un dossier introuvable", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await expect(majEtape(repo, "S0302", "ZZ", "fait")).rejects.toThrow(/Etape inconnue/);
    await expect(majEtape(repo, "S9999", "R3", "fait")).rejects.toThrow(/introuvable/);
  });

  it("migre en douceur un dossier persiste a l'ancienne nomenclature (P/V/C) sans crash ni perte", async () => {
    // Dossier stocke a l'ancienne (P3 fait) : la lecture doit le rehydrater sur R1..R11 et
    // preserver l'etat coche de P3. Une etape R* reste modifiable (pas de "Etape inconnue").
    const ancien = {
      ref: "S0400",
      nomUsuel: "Ancien",
      statut: "production" as const,
      etapes: [
        { code: "P3", phase: "PATRIMOINE" as const, libelle: "Production", statut: "fait" as const },
        { code: "P1", phase: "PATRIMOINE" as const, libelle: "Preparation", statut: "a_faire" as const },
      ],
      compteurs: {},
      anomalies: [],
      journal: [],
    };
    await repo.sauver(ancien);

    const lu = await obtenirDossier(repo, "S0400");
    expect(lu!.etapes.map((e) => e.code).slice(0, 11)).toEqual([
      "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11",
    ]);
    // P3 (coche) preserve ; P1 (a_faire, sans info) abandonne.
    expect(lu!.etapes.find((e) => e.code === "P3")!.statut).toBe("fait");
    expect(lu!.etapes.find((e) => e.code === "P1")).toBeUndefined();
    // Une etape canonique reste modifiable apres migration.
    const d = await majEtape(repo, "S0400", "R6", "en_cours");
    expect(d.etapes.find((e) => e.code === "R6")!.statut).toBe("en_cours");
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

// Jeu minimal COHERENT (passe verifierTout) sauf un tantieme faux qui casse la cle 100.
function jeuAvecEcart(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", commentaire: "L1" },
      { numero: 2, type: "Appartement", usage: "residential", commentaire: "L2" },
    ],
    cles: [
      { code: "001", libelle: "Charges generales", totalAttendu: 1000, defaut: true },
      { code: "100", libelle: "Ascenseur", totalAttendu: 500 },
    ],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 600 },
      { cleCode: "001", lot: 2, valeur: 400 },
      { cleCode: "100", lot: 1, valeur: 250 },
      { cleCode: "100", lot: 2, valeur: 200 }, // faux : Σ=450 != 500 -> ecart bloquant
    ],
    owners: [
      { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
      { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
    ],
    attributions: [
      { ownerId: "o1", lot: 1 },
      { ownerId: "o2", lot: 2 },
    ],
  };
}

describe("corrigerJeuDossier", () => {
  it("corrige un tantieme faux, repasse les auto-checks et met le dossier pret a produire", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await enregistrerJeu(repo, "S0302", jeuAvecEcart());

    const res = await corrigerJeuDossier(
      repo,
      "S0302",
      [{ type: "tantieme.modifier", cleCode: "100", lot: 2, valeur: 250 }],
      "2026-07-16T10:00:00.000Z",
    );

    expect(res.recap.pretAProduire).toBe(true);
    expect(res.recap.checks.ok).toBe(true);
    // Persistance : le jeu corrige est relu, compteurs a jour, journal alimente.
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.jeu!.tantiemes.find((t) => t.cleCode === "100" && t.lot === 2)!.valeur).toBe(250);
    expect(d!.compteurs.nbAnomalies).toBe(0);
    expect(d!.journal.at(-1)!.texte).toContain("Correction manuelle");
    expect(d!.journal.at(-1)!.texte).toContain("1 tantieme(s)");
  });

  it("fusionne deux owners et journalise le detail (PII-free)", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const jeu = jeuAvecEcart();
    jeu.owners.push({ id: "o2bis", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false });
    jeu.attributions.push({ ownerId: "o2bis", lot: 2 });
    await enregistrerJeu(repo, "S0302", jeu);

    const res = await corrigerJeuDossier(
      repo,
      "S0302",
      [{ type: "owner.fusionner", survivantId: "o2", absorbeId: "o2bis" }],
      "2026-07-16T10:05:00.000Z",
    );
    expect(res.recap.owners.total).toBe(2);
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.jeu!.owners.some((o) => o.id === "o2bis")).toBe(false);
    expect(d!.journal.at(-1)!.texte).toContain("fusion");
  });

  it("rejette (sans persister) une correction referencant une entite inconnue", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await enregistrerJeu(repo, "S0302", jeuAvecEcart());
    await expect(
      corrigerJeuDossier(repo, "S0302", [{ type: "tantieme.modifier", cleCode: "999", lot: 1, valeur: 1 }], "2026-07-16T10:10:00.000Z"),
    ).rejects.toThrow(/introuvable/);
    // Le jeu n'a pas bouge (le tantieme faux est toujours la).
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.jeu!.tantiemes.find((t) => t.cleCode === "100" && t.lot === 2)!.valeur).toBe(200);
  });

  it("leve si aucun jeu n'a ete analyse", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await expect(
      corrigerJeuDossier(repo, "S0302", [{ type: "tantieme.modifier", cleCode: "001", lot: 1, valeur: 1 }], "2026-07-16T10:15:00.000Z"),
    ).rejects.toThrow(/Aucun jeu/);
  });
});
