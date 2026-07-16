// Tests du service d'analyse UNIFIEE : aiguillage grand livre vs patrimoine, liaison owners<->450,
// blocs compta/liaison du recap, degradation stricte sans grand livre. Providers MOCK (aucun
// reseau). Noms SYNTHETIQUES (inventes) - aucune donnee reelle.
import { describe, expect, it } from "vitest";
import { analyserDossierUnifie, estGrandLivre } from "../analyser-dossier";
import { MockExtractionProvider } from "@/lib/reprise/adapters/extraction/mock-extraction-provider";
import { MockComptaExtractionProvider } from "@/lib/reprise/adapters/compta-extraction/mock-provider";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { ResultatPatrimoine, ResultatProprietaires } from "@/lib/reprise/ports/extraction-provider";

const doc = (nom: string): DocumentSource => ({ nom, contenu: new Uint8Array() });

const PATRIMOINE: ResultatPatrimoine = {
  lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "T3" }],
  cles: [{ code: "001", libelle: "Charges générales", totalAttendu: 100, defaut: true }],
  tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
  notes: ["note patrimoine"],
};
const PROPRIETAIRES: ResultatProprietaires = {
  owners: [
    { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
    { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
    { id: "o3", civilite: "m", nom: "INCONNU", prenom: "Zoe", pro: false },
  ],
  attributions: [{ ownerId: "o1", lot: 1 }],
  notes: ["note proprietaires"],
};

const JEU_GL: JeuEcritures = {
  lignes: [
    { date: "2025-10-01", compte: "4501.100", libelle: "Appel de fonds", sens: "debit", montant: 100, classe: 4 },
    { date: "2025-10-01", compte: "7010000", libelle: "Produit", sens: "credit", montant: 100, classe: 7 },
  ],
  notes: [],
  intitules: { "4501.100": "MARTIN PAUL", "4501.200": "NOVAK ELENA" },
};

function providers() {
  return {
    patrimoine: new MockExtractionProvider(PATRIMOINE, PROPRIETAIRES),
    compta: new MockComptaExtractionProvider(JEU_GL),
  };
}

describe("estGrandLivre", () => {
  it("reconnait les noms de grand livre", () => {
    expect(estGrandLivre("Grand Livre 2025.pdf")).toBe(true);
    expect(estGrandLivre("grand_livre.pdf")).toBe(true);
    expect(estGrandLivre("S0302-GL.pdf")).toBe(true);
    expect(estGrandLivre("gl.pdf")).toBe(true);
  });
  it("n'attrape pas un document patrimoine", () => {
    expect(estGrandLivre("rcp.pdf")).toBe(false);
    expect(estGrandLivre("feuille de presence.pdf")).toBe(false);
    expect(estGrandLivre("angle-du-batiment.pdf")).toBe(false); // "gl" au milieu d'un mot
  });
});

describe("analyserDossierUnifie", () => {
  it("avec grand livre : produit la liaison + les blocs compta/liaison du recap", async () => {
    const { patrimoine, compta } = providers();
    const { jeu, recap, compta: resume } = await analyserDossierUnifie(patrimoine, compta, [
      doc("rcp.pdf"),
      doc("grand livre.pdf"),
    ]);

    // Liaison : o1 et o2 lies, o3 sans compte.
    expect(jeu.liaisons450).toHaveLength(3);
    const parOwner = new Map(jeu.liaisons450!.map((l) => [l.ownerId, l]));
    expect(parOwner.get("o1")).toMatchObject({ statut: "lie", compteSource: "4501.100" });
    expect(parOwner.get("o2")).toMatchObject({ statut: "lie", compteSource: "4501.200" });
    expect(parOwner.get("o3")!.statut).toBe("non_trouve");

    // Recap : blocs liaison + compta.
    expect(recap.liaison).toEqual({ total: 3, lies: 2, aTrancher: 0, sansCompte: 1 });
    expect(recap.compta).toEqual({ equilibre: true, ecart: 0, nbComptes: 2, nbEcritures: 2 });
    expect(resume).toEqual(recap.compta);
    // Notes patrimoine + proprietaires conservees.
    expect(recap.notes).toContain("note patrimoine");
    expect(recap.notes).toContain("note proprietaires");
    // pretAProduire inchange (la liaison ne bloque pas).
    expect(recap.pretAProduire).toBe(true);
  });

  it("sans grand livre : degradation stricte, aucun bloc compta/liaison", async () => {
    const { patrimoine, compta } = providers();
    const { jeu, recap, compta: resume } = await analyserDossierUnifie(patrimoine, compta, [doc("rcp.pdf")]);
    expect(jeu.liaisons450).toBeUndefined();
    expect(recap.liaison).toBeUndefined();
    expect(recap.compta).toBeUndefined();
    expect(resume).toBeUndefined();
  });

  it("provider compta null : pas d'analyse compta meme si un grand livre est joint", async () => {
    const { patrimoine } = providers();
    const { jeu, recap } = await analyserDossierUnifie(patrimoine, null, [doc("grand livre.pdf")]);
    expect(jeu.liaisons450).toBeUndefined();
    expect(recap.compta).toBeUndefined();
  });

  // Grand livre inexploitable (couche texte only leve une erreur sur un scan) : le patrimoine
  // reste analyse (degradation PARTIELLE), l'erreur remonte dans recap.comptaErreur.
  const comptaKO: ExtractionComptaProvider = {
    async extraireGrandLivre() {
      throw new Error("scan detecte : couche texte inexploitable");
    },
  };

  it("grand livre scanne + patrimoine : degradation partielle (patrimoine OK, erreur compta exposee)", async () => {
    const { patrimoine } = providers();
    const { jeu, recap, compta } = await analyserDossierUnifie(patrimoine, comptaKO, [
      doc("rcp.pdf"),
      doc("grand livre.pdf"),
    ]);
    // Erreur compta remontee, aucun bloc compta/liaison, mais patrimoine analyse normalement.
    expect(recap.comptaErreur).toBe("scan detecte : couche texte inexploitable");
    expect(recap.compta).toBeUndefined();
    expect(compta).toBeUndefined();
    expect(jeu.liaisons450).toBeUndefined();
    expect(recap.lots.total).toBeGreaterThan(0);
    expect(recap.pretAProduire).toBe(true);
  });

  it("grand livre scanne SEUL : remonte l'erreur explicite (rien d'autre a analyser)", async () => {
    const { patrimoine } = providers();
    await expect(
      analyserDossierUnifie(patrimoine, comptaKO, [doc("grand livre.pdf")]),
    ).rejects.toThrow(/scan detecte/);
  });
});
